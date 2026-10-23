import http, { unwrap } from '../utils/api.js'
import { checkedBarcodeLookup } from '../utils/barcode.js'

export const lookupApi = {
  barcode:         (barcode, project) => checkedBarcodeLookup(barcode,
    code => http.get('/common/lookup-barcode', { params: { barcode: code, project } }).then(unwrap)),
  poly:            (cqDelibera)     => http.get(`/common/lookup-poly?cqDelibera=${encodeURIComponent(cqDelibera)}`).then(unwrap),
  def:             (codeDef)        => http.get(`/common/lookup-def?codeDef=${encodeURIComponent(codeDef)}`).then(unwrap),
  tampons:         ()               => http.get('/common/poly-tampons').then(unwrap),
  tamponCodes:     ()               => http.get('/common/tampon-codes').then(unwrap),
  defCodes:        ()               => http.get('/common/def-codes').then(unwrap),
  defCodesList:    ()               => http.get('/common/def-codes-list').then(unwrap),
  supervisors:     ()               => http.get('/common/supervisors').then(unwrap),
  supervisorsList: ()               => http.get('/common/supervisors-list').then(unwrap),
  addSupervisor:   (name)           => http.post('/common/supervisors', { name }).then(unwrap),
  importSupervisors: (names)        => http.post('/common/supervisors/import', names).then(unwrap),
  deleteSupervisor:(name)           => http.delete(`/common/supervisors?name=${encodeURIComponent(name)}`).then(unwrap),
  addDefCode:      (cod, desc, dem, delai) => http.post('/common/def-codes', { cod, description: desc, demerite: dem, delaiEcheanceHeures: delai ?? null }).then(unwrap),
  updateDefCode:   (cod, desc, dem, delai) => http.put('/common/def-codes', { cod, description: desc, demerite: dem, delaiEcheanceHeures: delai ?? null }).then(unwrap),
  importDefCodes:  (codes)           => http.post('/common/def-codes/import', { codes }).then(unwrap),
  deleteDefCode:   (cod)            => http.delete(`/common/def-codes?cod=${encodeURIComponent(cod)}`).then(unwrap),
}
