const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Serve os arquivos estáticos da pasta public
app.use(express.static('public'));

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.pdfFile) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const pdfBuffer = req.files.pdfFile.data;
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text;

        // Dicionário para armazenar o resultado final estruturado por turma
        let resultado = {};

        // Expressão regular para encontrar cada bloco de "Turma: ..." até a próxima "Turma:" ou fim do texto
        const blocoTurmas = text.split(/(?=Turma:\s*)/g);

        blocoTurmas.forEach(bloco => {
            // Descobre o nome da turma na primeira linha do bloco
            const matchTurma = bloco.match(/Turma:\s*([^\r\n]+)/);
            if (!matchTurma) return;

            const nomeTurma = matchTurma[1].trim();
            resultado[nomeTurma] = [];

            // Divide o bloco da turma em linhas individuais
            const linhas = bloco.split(/\r?\n/);

            linhas.forEach(linha => {
                const linhaLimpa = linha.trim();
                
                // Ignora linhas que são cabeçalhos ou traços do Urânia
                if (linhaLimpa.includes('Horário escolar') || linhaLimpa.includes('-----------')) return;

                // Procura pelas palavras-chave exatas das disciplinas desejadas
                const contemMateria = /(PORT|MAT|INGLÊS|INGLES)/i.test(linhaLimpa);

                if (contemMateria) {
                    // Evita adicionar duplicados no mesmo bloco da turma
                    if (!resultado[nomeTurma].includes(linhaLimpa)) {
                        resultado[nomeTurma].push(linhaLimpa);
                    }
                }
            });

            // Se a turma não teve nenhuma matéria encontrada, removemos para limpar a tela
            if (resultado[nomeTurma].length === 0) {
                delete resultado[nomeTurma];
            }
        });

        res.json({ dados: resultado });

    } catch (error) {
        console.error("Erro interno do Servidor:", error);
        res.status(500).json({ error: 'Erro interno ao processar o conteúdo do PDF.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso em http://localhost:${PORT}`);
});
