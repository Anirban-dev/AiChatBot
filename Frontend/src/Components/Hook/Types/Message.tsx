export interface Message {
  _id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}