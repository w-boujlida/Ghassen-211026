import http, { unwrap } from '../utils/api.js'
import { buildQuery } from '../utils/helpers.js'

export const projectsApi = {
  getProjects:   ()                 => http.get('/projects').then(unwrap),
  getRefs:       (name, p, l)       => http.get(`/projects/${name}/refs?page=${p}&limit=${l}`).then(unwrap),
  getLignesProjet:(name)            => http.get(`/projects/${name}/lignes-projet`).then(unwrap),
  create:        (name)             => http.post('/projects', { name }).then(unwrap),
  importRefs:    (name, refs)       => http.post(`/projects/${name}/refs/import`, { refs }).then(unwrap),
  addRef:        (name, ref)        => http.post(`/projects/${name}/refs`, ref).then(unwrap),
  updateRef:     (name, rowid, ref) => http.put(`/projects/${name}/refs?rowid=${encodeURIComponent(rowid)}`, ref).then(unwrap),
  deleteRef:     (name, rowid)      => http.delete(`/projects/${name}/refs?rowid=${encodeURIComponent(rowid)}`).then(unwrap),
  rename:        (name, newN)       => http.put(`/projects/${name}/rename`, { new_name: newN }).then(unwrap),
  delete:        (name)             => http.delete(`/projects/${name}`).then(unwrap),
  bulkDeleteRefs:(name, ids)        => http.delete(`/projects/${name}/refs/bulk`, { data: { ids } }).then(unwrap),
  upsertRefs:    (name, refs)       => http.post(`/projects/${name}/refs/upsert`, { refs }).then(unwrap),
  getRefMessages:(name, pdef)       => http.get(`/projects/${name}/refs/messages?pdef=${encodeURIComponent(pdef)}`).then(unwrap),
  setRefMessages:(name, pdef, msgs) => http.put(`/projects/${name}/refs/messages?pdef=${encodeURIComponent(pdef)}`, { messages: msgs }).then(unwrap),
  getRefCheckpoints:(name, pdef)    => http.get(`/projects/${name}/refs/checkpoints?pdef=${encodeURIComponent(pdef)}`).then(unwrap),
  setRefCheckpoints:(name, pdef, cps) => http.put(`/projects/${name}/refs/checkpoints?pdef=${encodeURIComponent(pdef)}`, { checkpoints: cps }).then(unwrap),
}
