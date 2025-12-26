const express = require("express");
const cors = require("cors");
const { Pool } = require("pg"); // Nova biblioteca
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// CONEXÃO COM O BANCO DE DADOS (POSTGRESQL)
// O sistema vai procurar a chave no Render. Se não achar, usa uma vazia (vai dar erro se tentar rodar sem configurar).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necessário para conexões seguras na nuvem
  },
});

// 1. Criando a tabela de VAGAS (Comando adaptado para Postgres)
// No Postgres, usamos SERIAL para números que crescem sozinhos
pool
  .query(
    `
    CREATE TABLE IF NOT EXISTS vagas (
        id SERIAL PRIMARY KEY,
        titulo TEXT,
        empresa TEXT,
        descricao TEXT,
        salario TEXT,
        contato TEXT,
        status INTEGER DEFAULT 0 
    )
`
  )
  .then(() => console.log("Tabela Criada/Verificada no PostgreSQL!"))
  .catch((err) => console.error("Erro ao criar tabela:", err));

// --- ROTAS (Adaptadas para usar 'pool.query' e '$1') ---

// ROTA PÚBLICA
app.get("/vagas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM vagas WHERE status = 1 ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ROTA DE CADASTRO
app.post("/vagas", async (req, res) => {
  // Adicione 'categoria' na lista de recebimento
  const { titulo, empresa, descricao, salario, contato, categoria } = req.body;

  try {
    // Agora são 6 itens ($1 até $6)
    await pool.query(
      "INSERT INTO vagas (titulo, empresa, descricao, salario, contato, status, categoria) VALUES ($1, $2, $3, $4, $5, 0, $6)",
      [titulo, empresa, descricao, salario, contato, categoria]
    );
    res.status(201).json({ mensagem: "Vaga enviada para análise!" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- ÁREA ADMINISTRATIVA ---

// Login (Mantém a mesma lógica simples)
app.post("/login", (req, res) => {
  const { senha } = req.body;
  if (senha === "admin123") {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ sucesso: false, mensagem: "Senha incorreta!" });
  }
});

// Ver pendentes
app.get("/admin/pendentes", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM vagas WHERE status = 0");
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Aprovar/Reprovar
app.put("/admin/vagas/:id", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    await pool.query("UPDATE vagas SET status = $1 WHERE id = $2", [
      status,
      id,
    ]);
    res.send("Status atualizado!");
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// --- SISTEMA DE BANNERS ---

// ROTA PÚBLICA: Pega os banners para mostrar no site
app.get("/banners", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM banners ORDER BY posicao ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ROTA ADMIN: Salva ou Atualiza um banner (Recebe imagem em Base64)
// Aumentamos o limite de tamanho para aceitar fotos (50mb)
app.use(express.json({ limit: "50mb" }));

app.post("/admin/banners", async (req, res) => {
  const { imagem, posicao } = req.body;

  try {
    // Verifica se já existe banner nessa posição
    const check = await pool.query("SELECT * FROM banners WHERE posicao = $1", [
      posicao,
    ]);

    if (check.rows.length > 0) {
      // Se já tem, ATUALIZA
      await pool.query("UPDATE banners SET imagem = $1 WHERE posicao = $2", [
        imagem,
        posicao,
      ]);
    } else {
      // Se não tem, CRIA
      await pool.query(
        "INSERT INTO banners (imagem, posicao) VALUES ($1, $2)",
        [imagem, posicao]
      );
    }
    res.json({ mensagem: "Banner salvo com sucesso!" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Jaú Emprega (Versão PostgreSQL) rodando na porta ${PORT}`);
});
