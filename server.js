const express = require('express');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

// Lista de disciplinas para separar o texto grudado do Urânia
const DICIONARIO_MATERIAS = [
    'RECMA', 'RECPOR', 'ED.FIS', 'E.RELI', 'ED.FIN', 'BIOSUS', 'QUITEC', 'INPROG', 
    'BCDAD1', 'BCDAD2', 'L.COMP', 'A.ME.S', 'MKTCTD', 'COM.MK', 'TECDIG', 'PL.MKT', 
    'SEGMKT', 'FILATF', 'SOCGCS', 'LPDTEX', 'FÍSICA', 'FISICA', 'ROB_IF', 'FISTEC', 
    'PROGRA', 'PBACK1', 'INOTEC', 'PFRO.E', 'PESMKT', 'A.MER.', 'LEGMKT', 'R.INTE', 
    'FTECME', 'SENAI 2', 'SENAI 3', 'F.ELET', 'FABMEC', 'ICORT2', 'ICORT1', 'ESPAN.', 
    'PR.VID', 'QUIM1', 'BIO2', 'FÍS2', 'FÍS3', 'MAT-2', 'COMP.G', 'A.PROJ', 'PRO.DS', 
    'P.MOBI', 'CDADOS', 'LOGMKT', 'E-COMM', 'ADAMKT', 'MKTDIG', 'MSISM1', 'MSISAU', 
    'MANEQP', 'MANELE', 'ORGPDM', 'METPRO', 'MSISEL', 'MSISM2', 'CLOGPR', 'CIÊN.', 
    'CIEN.', 'HIST1', 'ARTE2', 'GEOG1', 'QUÍM', 'QUIM', 'BIO2', 'PORT', 'INGLÊS', 
    'INGLES', 'ARTE', 'HIST', 'RE/LE', 'EDIGIT', 'MAT', 'GEO', 'BIO', 'FIL'
].sort((a, b) => b.length - a.length);

function separarDias(texto) {
    let dias = [];
    let restante = texto.trim();
    while (restante.length > 0 && dias.length < 5) {
        let achou = false;
        for (let mat of DICIONARIO_MATERIAS) {
            if (restante.toUpperCase().startsWith(mat)) {
                dias.push(restante.substring(0, mat.length));
                restante = restante.substring(mat.length).trim();
                achou = true;
                break;
            }
        }
        if (!achou) {
            let proximo = restante.match(/[A-ZÁÉÍÓÚÂÊÔÇ][a-záéíóúâêôç\d\.\-\/]*/);
            if (proximo) {
                dias.push(proximo[0]);
                restante = restante.substring(proximo.index + proximo[0].length).trim();
            } else {
                dias.push(restante);
                break;
            }
        }
    }
    return dias;
}

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.pdfFile) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
        const pdfData = await pdfParse(req.files.pdfFile.data);
        const blocos = pdfData.text.split(/(?=Turma:\s*)/g);
        let resultado = {};

        blocos.forEach(bloco => {
            const matchTurma = bloco.match(/Turma:\s*([^\r\n]+)/);
            if (!matchTurma) return;
            
            const nomeTurma = matchTurma[1].trim();
            resultado[nomeTurma] = [];

            const linhas = bloco.split(/\r?\n/);
            linhas.forEach(linha => {
                const matchHora = linha.trim().match(/^(\d{2}:\d{2})/);
                if (matchHora) {
                    const hora = matchHora[1];
                    const textoMaterias = linha.trim().substring(hora.length);
                    const listaDias = separarDias(textoMaterias);
                    
                    resultado[nomeTurma].push({ horario: hora, dias: listaDias });
                }
            });
        });

        res.json({ dados: resultado });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar o PDF.' });
    }
});

app.listen(3000, () => console.log(`Servidor rodando em http://localhost:3000`));
