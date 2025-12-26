const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const db = new sqlite3.Database("jau-emprega.db");

// 1. Criando a tabela de VAGAS
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vagas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        empresa TEXT,
        descricao TEXT,
        salario TEXT,
        contato TEXT,
        status INTEGER DEFAULT 0 
    )`);
  // Status 0 = Pendente (Ninguém vê)
  // Status 1 = Aprovada (Site mostra)
  // Status 2 = Reprovada
});

// --- ROTA PÚBLICA (O que todo mundo vê) ---
app.get("/vagas", (req, res) => {
  // Só mostramos as vagas com status 1 (Aprovadas)
  db.all(
    "SELECT * FROM vagas WHERE status = 1 ORDER BY id DESC",
    (err, rows) => {
      if (err) return res.status(500).send(err.message);
      res.json(rows);
    }
  );
});

// --- ROTA DE CADASTRO (Qualquer um pode enviar) ---
app.post("/vagas", (req, res) => {
  const { titulo, empresa, descricao, salario, contato } = req.body;

  // Inserimos com status 0 (Pendente) automaticamente
  const sql =
    "INSERT INTO vagas (titulo, empresa, descricao, salario, contato, status) VALUES (?, ?, ?, ?, ?, 0)";

  db.run(sql, [titulo, empresa, descricao, salario, contato], function (err) {
    if (err) return res.status(500).send(err.message);
    res
      .status(201)
      .json({ mensagem: "Vaga enviada para análise!", id: this.lastID });
  });
});

// --- ÁREA ADMINISTRATIVA (Só você deve acessar) ---

// Ver vagas pendentes
app.get("/admin/pendentes", (req, res) => {
  db.all("SELECT * FROM vagas WHERE status = 0", (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Aprovar ou Reprovar vaga
app.put("/admin/vagas/:id", (req, res) => {
  const id = req.params.id;
  const { status } = req.body; // Recebe 1 (Aprovar) ou 2 (Reprovar)

  db.run("UPDATE vagas SET status = ? WHERE id = ?", [status, id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.send("Status da vaga atualizado!");
  });
});
// --- ROTA DE LOGIN (Segurança) ---
app.post("/login", (req, res) => {
  const { senha } = req.body;

  // A senha "secreta" é admin123
  if (senha === "admin123") {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ sucesso: false, mensagem: "Senha incorreta!" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Jaú Emprega rodando na porta ${PORT}`);
});
