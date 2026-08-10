const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Servir a interface gráfica (index.html) da pasta public
app.use(express.static('public'));

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.pdfFile) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const pdfBuffer = req.files.pdfFile.data;
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text;

        const linhas = text.split('\n');
        let turmaAtual = 'Desconhecida';
        let resultado = {};
        const materiasAlvo = ['PORT', 'MAT', 'INGLÊS', 'INGLES'];

        linhas.forEach(linha => {
            if (linha.includes('Turma:')) {
                const match = linha.match(/Turma:\s*([^\s]+)/);
                if (match) turmaAtual = match[1];
                if (!resultado[turmaAtual]) resultado[turmaAtual] = [];
            }

            materiasAlvo.forEach(materia => {
                if (linha.toUpperCase().includes(materia)) {
                    if (resultado[turmaAtual] && !resultado[turmaAtual].includes(linha.trim())) {
                        resultado[turmaAtual].push(linha.trim());
                    }
                }
            });
        });

        res.json({ dados: resultado });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar o PDF.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
