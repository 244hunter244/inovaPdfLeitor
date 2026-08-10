const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

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
                    const horarioVoz = matchHora[1];
                    let conteudoMaterias = linha.substring(matchHora[0].length).trim();
                    let colunasDia = conteudoMaterias.split(/(?=\b\d+°[A-Z]|\b\d+º[A-Z])/g).map(c => c.trim());

                    for (let i = 0; i < 5; i++) {
                        let celula = colunasDia[i] || '';
                        if (!celula || /^(HA|H\.A\.|H\.A|------)$/i.test(celula)) continue;

                        if (celula.includes('/')) {
                            let partes = celula.split('/');
                            let turma = partes[0].trim();
                            let materia = partes[1].trim();

                            const m = materia.toUpperCase();
                            if (m.includes('PORT') || m.includes('RECPOR') || m.includes('MAT') || m.includes('RECMAT') || m.includes('INGL') || m.includes('RE/LE')) {
                                todasAulasDisponiveis.push({
                                    professor: nomeProfessor,
                                    horario: horarioVoz,
                                    diaOriginal: DIAS_SEMANA[i] || 'Segunda',
                                    turma: turma,
                                    materia: materia
                                });
                            }
                        }
                    }
                }
            });
        });

        let mapaDeOcupacao = {};
        DIAS_SEMANA.forEach(dia => { mapaDeOcupacao[dia] = {}; });

        // Nova estrutura de controle: contagemCota["NomeDoProf_NomeDaTurma"] = total de aulas alocadas
        let contagemCota = {};
        let registrosParaBanco = [];

        // Embaralha para distribuir bem nos 3 laboratórios ao longo da semana
        todasAulasDisponiveis.sort(() => Math.random() - 0.5);

        todasAulasDisponiveis.forEach(aula => {
            const prof = aula.professor;
            const turma = aula.turma;
            const chaveCota = `${prof}_${turma}`;

            if (!contagemCota[chaveCota]) contagemCota[chaveCota] = 0;
            
            // REGRA: Garante no máximo 2 aulas para esta combinação específica de Professor + Turma
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
                    diaSemana: diaAlocado,
                    laboratorio: `Laboratório 0${numeroLaboratorio}`,
                    turma: turma,
                    materia: aula.materia
                });
            }
        });

        registrosParaBanco.sort((a, b) => {
            const ordemDia = DIAS_SEMANA.indexOf(a.diaSemana) - DIAS_SEMANA.indexOf(b.diaSemana);
            if (ordemDia !== 0) return ordemDia;
            return a.horario.localeCompare(b.horario) || a.laboratorio.localeCompare(b.laboratorio);
        });

        res.json({ dados: registrosParaBanco });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao processar e distribuir horários por turma.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:3000`));
