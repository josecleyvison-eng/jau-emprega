const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config(); // Recomendado para ler o .env localmente

const app = express();

// --- CONFIGURAÇÕES INICIAIS ---
// IMPORTANTE: O limite deve vir PRIMEIRO para aceitar as imagens dos banners
app.use(express.json({ limit: "50mb" }));
app.use(cors());
app.use(express.static(__dirname));

// --- CONEXÃO COM O BANCO DE DADOS (NEON / POSTGRES) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necessário para conexões seguras na nuvem (Render/Neon)
  },
});

// --- INICIALIZAÇÃO DAS TABELAS (Garante que tudo existe) ---
// Essa função roda assim que o servidor liga para verificar as tabelas
const initDB = async () => {
  try {
    // 1. Tabela de Vagas (Completa com WhatsApp e Categoria)
    await pool.query(`
            CREATE TABLE IF NOT EXISTS vagas (
                id SERIAL PRIMARY KEY,
                titulo TEXT,
                empresa TEXT,
                descricao TEXT,
                salario TEXT,
                contato TEXT,
                whatsapp TEXT, 
                categoria TEXT,
                status INTEGER DEFAULT 0, -- 0: Pendente, 1: Aprovada
                data_postagem TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // 2. Tabela de Banners
    await pool.query(`
            CREATE TABLE IF NOT EXISTS banners (
                id SERIAL PRIMARY KEY,
                imagem TEXT,
                posicao INTEGER
            )
        `);

    console.log("✅ Banco de Dados conectado e tabelas verificadas!");
  } catch (err) {
    console.error("❌ Erro ao iniciar banco:", err);
  }
};

initDB();

// ================= ROTAS PÚBLICAS =================

// 1. Listar Vagas Aprovadas
// Mantive o seu filtro de 7 dias, mas se quiser mostrar todas as ativas, remova a linha do "AND data_postagem"
app.get("/vagas", async (req, res) => {
  try {
    const { rows } = await pool.query(`
            SELECT * FROM vagas 
            WHERE status = 1 
            ORDER BY data_postagem DESC
        `);
    // Nota: Removi o filtro de 7 dias (AND data_postagem >= NOW() - INTERVAL '7 days')
    // para garantir que suas vagas de teste apareçam. Se quiser o filtro de volta, é só recolocar.

    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 2. CADASTRO DE VAGA (ATUALIZADO COM WHATSAPP)
app.post("/vagas", async (req, res) => {
  // Recebe o novo campo 'whatsapp'
  const { titulo, empresa, descricao, salario, contato, whatsapp, categoria } =
    req.body;

  try {
    await pool.query(
      `INSERT INTO vagas 
      (titulo, empresa, descricao, salario, contato, whatsapp, categoria, status) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`, // Status 0 = Pendente
      [titulo, empresa, descricao, salario, contato, whatsapp, categoria]
    );
    res.status(201).json({ mensagem: "Vaga enviada para análise!" });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// 3. Listar Banners
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

// ================= ÁREA ADMINISTRATIVA =================

// 1. Login
app.post("/login", (req, res) => {
  const { senha } = req.body;
  if (senha === "admin123") {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ sucesso: false, mensagem: "Senha incorreta!" });
  }
});

// 2. Ver Vagas Pendentes
app.get("/admin/pendentes", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM vagas WHERE status = 0 ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 3. Ver Vagas Aprovadas (Para o Admin excluir)
app.get("/admin/aprovadas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM vagas WHERE status = 1 ORDER BY data_postagem DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 4. Aprovar ou Reprovar
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

// 5. Excluir Vaga (Botão Vermelho)
app.delete("/admin/vagas/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query("DELETE FROM vagas WHERE id = $1", [id]);
    res.json({ mensagem: "Vaga excluída com sucesso!" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 6. Salvar Banners (Admin)
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
    console.error(err); // Importante para ver o erro no console do Render
    res.status(500).send(err.message);
  }
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Jaú Emprega (PostgreSQL) rodando na porta ${PORT}`);
});
