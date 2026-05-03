const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const axios = require('axios')
const pino = require('pino')
const qrcode = require('qrcode-terminal')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

async function sendToTelegram(text) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  })
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true })
      console.log('Отсканируй QR код в WhatsApp')
    }
    if (connection === 'open') {
      console.log('WhatsApp подключён!')
      await sendToTelegram('✅ WhatsApp бот запущен и подключён!')
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue // игнорируем свои сообщения

      const from = msg.key.remoteJid
      const isGroup = from.endsWith('@g.us')
      const sender = msg.pushName || 'Неизвестный'
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   '📎 Медиафайл'

      if (isGroup) {
        // Только если есть упоминание или это важная группа
        const groupName = from
        await sendToTelegram(`👥 <b>Группа:</b> ${groupName}\n👤 <b>От:</b> ${sender}\n💬 ${text}`)
      } else {
        await sendToTelegram(`📩 <b>Личное сообщение</b>\n👤 <b>От:</b> ${sender}\n💬 ${text}`)
      }
    }
  })
}

startBot()
