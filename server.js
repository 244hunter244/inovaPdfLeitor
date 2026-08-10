const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fileUpload = require('express-fileupload');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

// CONEXÃO COM O SUPABASE
const SUPABASE_URL = 'https://wsfbsjddjpmcomlqhepr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TlOrAEtgQqn8HDWf88mkAA_TAmqNmtR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

function separarMateriaETurma(celulaTexto) {
    if (!celulaTexto) return null;

    let textoLimpo = celulaTexto.replace(/\r?\n/g, '/').replace(/[\.\-]/g, '').trim();
    
    let blocos = textoLimpo.split('/').map(b => b.trim()).filter(b => b.length > 0);

    let materiaFinal = '';
    let turmaFinal = '';

    for (let bloco of blocos) {
        let blocoUpper = bloco.toUpperCase();
        
        if (/^(HA|H\.A\.|HA\d+.*|CNT|------)$/i.test(blocoUpper) || blocoUpper.includes('HORÁRIO')) {
            continue;
        }

        const regexTurma = /(\d+[\u00b0\u00ba\u00aa°º][A-Z](?:\s+[A-Z]+)?)/i;
        const matchTurma = bloco.match(regexTurma);

        if (matchTurma) {
            turmaFinal = matchTurma[0].trim();
            let possivelMateria = bloco.replace(regexTurma, '').trim();
            if (possivelMateria) {
                materiaFinal = possivelMateria;
            }
        } else {
            if (!materiaFinal && bloco.length > 2) {
                materiaFinal = bloco;
            }
        }
    }

    if (materiaFinal) {
        const m = materiaFinal.toUpperCase();
        if (m.includes('PORT') || m.includes('RECPOR') || m.includes('MAT') || m.includes('RECMAT') || m.includes('RECMA') || m.includes('INGL') || m.includes('RE/LE')) {
            return {
                materia: materiaFinal,
                turma: turmaFinal || 'Geral'
            };
        }
    }

    return null;
}

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.pdfFile) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const pdfData = await pdfParse(req.files.pdfFile.data);
        const textoBruto = pdfData.text;

        let todasAulasDisponiveis = [];
        const blocosProfessores = textoBruto.split(/(?=\n[A-Z][a-z]+ [A-Z][a-z]+)/g);

        blocosProfessores.forEach(bloco => {
            const linhas = bloco.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (linhas.length < 3) return;

            let nomeProfessor = linhas[0];
            if (nomeProfessor.includes('Manhã') || nomeProfessor.includes('Relatório')) {
                nomeProfessor = linhas[1];
            }
            if (/^(URANINUP|URININUP|Página|Horário escolar|0800)/i.test(nomeProfessor)) return;

            linhas.forEach(linha => {
                const matchHora = linha.match(/^(\d{2}:\d{2})/);
                if (matchHora) {
                    const horarioVoz = matchHora[0];
                    let conteudoMaterias = linha.substring(matchHora[0].length).trim();
                    
                    let colunasDia = conteudoMaterias.split(/\s{2,}/);

                    for (let i = 0; i < 5; i++) {
                        let celulaBruta = colunasDia[i] || '';
                        let dadosFiltrados = separarMateriaETurma(celulaBruta);

                        if (dadosFiltrados) {
                            todasAulasDisponiveis.push({
                                professor: nomeProfessor,
                                horario: horarioVoz,
                                diaOriginal: DIAS_SEMANA[i] || 'Segunda',
                                turma: dadosFiltrados.turma,
                                materia: dadosFiltrados.materia
                            });
                        }
                    }
                }
            });
        });

        let mapaDeOcupacao = {};
        DIAS_SEMANA.forEach(dia => { mapaDeOcupacao[dia] = {}; });

        let contagemCota = {};
        let registrosParaBanco = [];

        todasAulasDisponiveis.sort(() => Math.random() - 0.5);

        todasAulasDisponiveis.forEach(aula => {
            const prof = aula.professor;
            const turma = aula.turma;
            const chaveCota = `${prof}_${turma}`;

            if (!contagemCota[chaveCota]) contagemCota[chaveCota] = 0;
            if (contagemCota[chaveCota] >= 2) return;

            let diaAlocado = null;
            let horaAlocada = aula.horario;

            if (!mapaDeOcupacao[aula.diaOriginal][horaAlocada]) mapaDeOcupacao[aula.diaOriginal][horaAlocada] = 0;

            if (mapaDeOcupacao[aula.diaOriginal][horaAlocada] < 3) {
                diaAlocado = aula.diaOriginal;
            } else {
                for (let diaAlternativo of DIAS_SEMANA) {
                    if (!mapaDeOcupacao[diaAlternativo][horaAlocada]) mapaDeOcupacao[diaAlternativo][horaAlocada] = 0;
                    if (mapaDeOcupacao[diaAlternativo][horaAlocada] < 3) {
                        diaAlocado = diaAlternativo;
                        break;
                    }
                }
            }

            if (diaAlocado) {
                mapaDeOcupacao[diaAlocado][horaAlocada]++;
                contagemCota[chaveCota]++;
                
                const numeroLaboratorio = mapaDeOcupacao[diaAlocado][horaAlocada];

                registrosParaBanco.push({
                    professor: prof,
                    horario: horaAlocada,
                    dia_semana: diaAlocado,
                    laboratorio: `Laboratório 0${numeroLaboratorio}`,
                    turma: turma,
                    materia: aula.materia
                });
            }
        });

        if (registrosParaBanco.length > 0) {
            const { error: deleteError } = await supabase
                .rpc('deletar_todos_os_horarios');

            if (deleteError) {
                console.error("Erro ao limpar dados antigos via RPC:", deleteError);
                return res.status(500).json({ error: 'Erro crítico ao limpar dados antigos no Supabase.' });
            }

            // 2. INSERE OS NOVOS REGISTROS LIMPOS E FORMATADOS
            const { error: insertError } = await supabase
                .from('horarios_laboratorio')
                .insert(registrosParaBanco);

            if (insertError) {
                console.error("Erro Supabase Inserção:", insertError);
                return res.status(500).json({ error: 'Erro ao salvar os novos dados no Supabase.' });
            }
        }

        res.json({ dados: registrosParaBanco, mensagem: "Enviado e atualizado com sucesso!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro geral no processamento.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:3000`));