import { Router } from 'express'

const router = Router()

router.post('/login', (req, res) => {
  const { email, password } = req.body

  if (email && password) {
    return res.json({
      token: 'dummy-token',
      user: { email }
    })
  }

  res.status(400).json({ message: 'Invalid data' })
})

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body

  return res.json({
    token: 'dummy-token',
    user: { name, email }
  })
})

export default router