const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

const therapistKeywords = [
  "depressed", "anxious", "hopeless", "suicidal", "worthless",
  "book therapist", "talk to therapist"
];
const therapistReply = `💬 It seems you're going through something tough.\n\n📞 Please contact our therapist: +254 700 123 456\n🕒 Mon–Fri, 9AM–5PM`;

app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;

  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const userText = message.text.toLowerCase();

  // Therapist suggestion
  if (therapistKeywords.some(word => userText.includes(word))) {
    await sendTelegramMessage(chatId, "📞 Please share your Safaricom phone number (format: 2547XXXXXXXX) to book a therapist session (KES 100).");
    return res.sendStatus(200);
  }

  // If the user sends a valid phone number, initiate STK Push
  const phoneRegex = /^2547\d{8}$/;
  if (phoneRegex.test(userText)) {
    await sendTelegramMessage(chatId, `✅ Initiating M-Pesa payment for KES 100...`);

    try {
      await initiateSTKPush(userText, 100, chatId);
    } catch (err) {
      console.error("STK Push Error:", err.response?.data || err.message);
      await sendTelegramMessage(chatId, "❌ Failed to initiate payment. Please try again later.");
    }
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

const initiateSTKPush = async (phoneNumber, amount, chatId) => {
  const tokenRes = await axios.get(
    `https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`,
    {
      auth: {
        username: process.env.MPESA_CONSUMER_KEY,
        password: process.env.MPESA_CONSUMER_SECRET,
      },
    }
  );

  const accessToken = tokenRes.data.access_token;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const password = Buffer.from(
    process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp
  ).toString("base64");

  await axios.post(
    `https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phoneNumber,
      CallBackURL: `${process.env.BASE_URL}/mpesa/callback/${chatId}`,
      AccountReference: "Therapy",
      TransactionDesc: "Therapy session booking",
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
};

app.post("/mpesa/callback/:chatId", async (req, res) => {
  const data = req.body;
  const chatId = req.params.chatId;

  const resultCode = data.Body?.stkCallback?.ResultCode;

  if (resultCode === 0) {
    const receipt = data.Body.stkCallback.CallbackMetadata.Item.find(i => i.Name === "MpesaReceiptNumber")?.Value;
    await sendTelegramMessage(chatId, `✅ Payment received. Receipt: ${receipt}\n\n🎉 Therapy session booked. A therapist will contact you shortly.`);
  } else {
    await sendTelegramMessage(chatId, "❌ Payment failed or cancelled.");
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Bot server running on port 3000"));
