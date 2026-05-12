import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})
console.log('Email User Loaded:', !!process.env.EMAIL_USER)
console.log('Email Pass Loaded:', !!process.env.EMAIL_PASS)


export const sendOTP = async (email: string, otp: string) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Verification Code - AiChatBot',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #4A90E2; text-align: center;">Verification Code</h2>
        <p>Hello,</p>
        <p>Your verification code for <strong>AiChatBot</strong> is:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; background: #f4f4f4; padding: 10px 20px; border-radius: 5px; border: 1px dashed #4A90E2;">
            ${otp}
          </span>
        </div>
        <p>This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Sent by AiChatBot - Your AI Companion</p>
      </div>
    `,
  }

  await transporter.sendMail(mailOptions)
}
