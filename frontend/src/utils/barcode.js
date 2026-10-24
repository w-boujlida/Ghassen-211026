export const BARCODE_ERROR = 'Code-barres erroné'
export const DUPLICATE_ERROR = 'Pièce déjà enregistrée'

export async function checkedBarcodeLookup(barcode, lookup, scanCodes) {
  try {
    if (!barcode || !barcode.trim()) {
      throw new Error(`${BARCODE_ERROR} : étiquette absente ou code vide.`)
    }
    const result = await lookup(barcode)
    if (result?.found === false) {
      throw new Error(`${BARCODE_ERROR} : aucune référence reconnue dans ce code.`)
    }
    return result
  } catch (error) {
    const message = error.response?.data?.error || error.message
    const duplicate = Boolean(message?.startsWith(DUPLICATE_ERROR))
    if (duplicate || message?.startsWith(BARCODE_ERROR)) {
      const field = message.match(/, code ([1-3])\./)
      const scanned = field && scanCodes ? scanCodes[Number(field[1]) - 1] : barcode
      window.dispatchEvent(new CustomEvent('barcode-error', { detail: {
        title: duplicate ? 'Pièce déjà scannée' : undefined,
        message,
        barcode: scanned,
        hint: duplicate
          ? 'Enregistrement bloqué. Vérifiez la pièce dans l’historique avant de continuer.'
          : undefined,
      } }))
    }
    throw error
  }
}
