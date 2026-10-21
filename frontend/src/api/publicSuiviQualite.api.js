import axios from 'axios'

// Instance dédiée, sans intercepteur JWT ni redirection 401 vers /login :
// cette page est publique et ne doit jamais être renvoyée vers l'écran de connexion.
const publicHttp = axios.create({
  baseURL: '/api/public/suivi-qualite',
  timeout: 30000,
})

function unwrap(res) {
  const body = res.data
  if (!body.success) throw new Error(body.error || body.message || 'Unknown error')
  return body.data
}

export const publicSuiviQualiteApi = {
  getDashboard: (params) => publicHttp.get('/dashboard', { params }).then(unwrap),
  getProjects:  ()       => publicHttp.get('/projects').then(unwrap),
  getLignes:    (projet) => publicHttp.get('/lignes', { params: { projet } }).then(unwrap),
}
