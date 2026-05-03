const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const axios = require('axios')
const pino = require('pino')
const QRCode = require('qrcode')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

async function sendToTelegram(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    })
    console.log('Сообщение отправлено в Telegram')
  } catch (e) {
    console.error('Ошибка sendMessage:', e.response?.data || e.message)
  }
}

async function sendQRToTelegram(qrString) {
  try {
    console.log('Генерирую QR...')
    const dataUrl = await QRCode.toDataURL(qrString)
    const base64 = dataUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')

    const params = new URLSearchParams()
    params.append('chat_id', TELEGRAM_CHAT_ID)

    const { default: FormData } = await import('form-data')
    const form = new FormData()
    form.append('chat_id', String(TELEGRAM_CHAT_ID))
    form.append('photo', buffer, { filename: 'qr.png', contentType: 'image/png' })

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form, {
      headers: form.getHeaders()
    })
    console.log('QR отправлен в Telegram!')
  } catch (e) {
    console.error('Ошибка sendQR:', e.response?.data || e.message)
    await sendToTelegram('⚠️ QR готов но не смог отправить картинку. Ошибка: ' + (e.response?.data?.description || e.message))
  }
}

async function startBot() {
  console.log('Запускаю бота...')
  await sendToTelegram('🚀 Бот запускается, жди QR код...')

  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('QR получен!')
      await sendQRToTelegram(qr)
    }
    if (connection === 'open') {
      console.log('WhatsApp подключён!')
      await sendToTelegram('✅ WhatsApp подключён! Теперь буду пересылать сообщения.')
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      console.log('Соединение закрыто, код:', code)
      if (code !== DisconnectReason.loggedOut) {
        console.log('Переподключаюсь...')
        startBot()
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      const from = msg.key.remoteJid
      const isGroup = from.endsWith('@g.us')
      const sender = msg.pushName || 'Неизвестный'
      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   '📎 Медиафайл'
      if (isGroup) {
        await sendToTelegram(`👥 <b>Группа</b>\n👤 <b>От:</b> ${sender}\n💬 ${text}`)
      } else {
        await sendToTelegram(`📩 <b>Личное сообщение</b>\n👤 <b>От:</b> ${sender}\n💬 ${text}`)
      }
    }
  })
}

startBot()
