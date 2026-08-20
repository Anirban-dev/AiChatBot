import api from '../Auth/AxiosHelper'

export const getSpeechStatus = async (): Promise<boolean> => {
  const response = await api.get(`/speech/status`)
  return response.data?.configured ?? false
}

export const transcribeAudio = async (blob: Blob, signal?: AbortSignal): Promise<string> => {
  const formData = new FormData()
  const ext = blob.type.includes('mp4') ? '.m4a' : blob.type.includes('ogg') ? '.ogg' : '.webm'
  formData.append('file', blob, `speech_${Date.now()}${ext}`)

  const response = await api.post(`/speech/stt`, formData, { signal })
  return (response.data?.text || '').trim()
}