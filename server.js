const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { MercadoPagoConfig, Payment } = require("mercadopago");
require("dotenv").config(); // Recomendado para ler o .env localmente

const app = express();

const client = new MercadoPagoConfig({
  accessToken:
    "APP_USR-4216696359213517-122623-cc45ad4fc64d83ce7aa3d57c2e327ff2-531009263",
});

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
const initDB = async () => {
  try {
    // 1. Tabela de Vagas
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
                id_pagamento BIGINT,
                status_pagamento TEXT DEFAULT 'pending',
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

app.get("/vagas", async (req, res) => {
  try {
    const { rows } = await pool.query(`
              SELECT * FROM vagas 
              WHERE status = 1 
              ORDER BY data_postagem DESC
          `);
    res.json(rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ================= ROTA DE CADASTRO COM PIX =================
app.post("/vagas", async (req, res) => {
  // 1. Recebe os dados do formulário
  const { titulo, empresa, descricao, salario, contato, whatsapp, categoria } =
    req.body;

  try {
    // 2. GERA O PIX NO MERCADO PAGO
    const payment = new Payment(client);

    const paymentData = {
      transaction_amount: 2.0, // Valor da taxa (R$ 2,00)
      description: `Vaga: ${titulo} - Jaú Emprega`,
      payment_method_id: "pix",
      payer: {
        email: contato, // O e-mail de quem está anunciando
      },
      // MUDAR PRO SEU LINK QUANDO FOR PRO AR NO RENDER:
      notification_url: "https://jau-emprega-oficial.onrender.com/webhook",
    };

    const result = await payment.create({ body: paymentData });

    // Pega os dados que o Mercado Pago devolveu
    const pagamentoId = result.id;
    const qrCode = result.point_of_interaction.transaction_data.qr_code;
    const qrCodeBase64 =
      result.point_of_interaction.transaction_data.qr_code_base64;

    // 3. Salva no banco com status -1 (Aguardando Pagamento)
    await pool.query(
      `INSERT INTO vagas 
      (titulo, empresa, descricao, salario, contato, whatsapp, categoria, status, id_pagamento, status_pagamento) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, -1, $8, 'pending')`,
      [
        titulo,
        empresa,
        descricao,
        salario,
        contato,
        whatsapp,
        categoria,
        pagamentoId,
      ]
    );

    // 4. Devolve o QR Code para o site mostrar a janelinha
    res.status(201).json({
      mensagem: "Vaga criada! Pague o PIX para liberar.",
      pix: {
        copia_e_cola: qrCode,
        imagem_base64: qrCodeBase64,
        id: pagamentoId,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao gerar PIX: " + err.message);
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

// ================= ROTA WEBHOOK (O Mercado Pago chama isso) =================
app.post("/webhook", async (req, res) => {
  const { data } = req.body;

  if (data && data.id) {
    try {
      // 1. Consulta o pagamento para ver se foi aprovado mesmo
      const payment = new Payment(client);
      const pagamento = await payment.get({ id: data.id });

      if (pagamento.status === "approved") {
        // 2. Se aprovado, muda o status da vaga para 0 (Pendente de Aprovação do Admin)
        console.log(`💰 Pagamento ${data.id} aprovado! Liberando vaga...`);
        // Atualiza status para 0 (aparece pro admin) e marca como pago
        await pool.query(
          "UPDATE vagas SET status = 0, status_pagamento = 'approved' WHERE id_pagamento = $1",
          [data.id]
        );
      }
    } catch (error) {
      console.error("Erro no webhook:", error);
    }
  }
  res.sendStatus(200); // Responde "OK" para o Mercado Pago não ficar tentando de novo
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Jaú Emprega rodando na porta ${PORT}`);
});
