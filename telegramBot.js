const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

const therapistKeywords = ["depressed", "anxious", "hopeless", "suicidal", "worthless"];
const therapistReply = `💬 It seems you're going through something tough.\n\n📞 Please contact our therapist: +254 700 123 456\n🕒 Mon–Fri, 9AM–5PM`;

app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;

  if (!message || !message.text) return res.sendStatus(200);
  const chatId = message.chat.id;
  const userText = message.text.toLowerCase();

  // Therapist suggestion
  if (therapistKeywords.some(word => userText.includes(word))) {
    await sendTelegramMessage(chatId, therapistReply);
    return res.sendStatus(200);
  }

  // AI Chat
  const aiResponse = await getAIResponse(userText);
  await sendTelegramMessage(chatId, aiResponse);
  res.sendStatus(200);
});

const sendTelegramMessage = async (chatId, text) => {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
    });
  } catch (error) {
    console.error("Telegram Error:", error.response?.data || error.message);
  }
};

const getAIResponse = async (userMessage) => {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "qwen/qwen3-30b-a3b:free",
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        },
      }
    );

    return response.data.choices?.[0]?.message?.content || "Sorry, I couldn't understand that.";
  } catch (error) {
    console.error("AI Response Error:", error.response?.data || error.message);
    return "Something went wrong.";
  }
};

app.listen(3000, () => console.log("Bot server running"));
