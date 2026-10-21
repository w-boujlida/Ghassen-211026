import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import translations, { LANGUAGES } from '../i18n/translations.js'

const LangContext = createContext(null)

const STORAGE_KEY = 'fw_lang'

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved && translations[saved] ? saved : 'fr'
  })

  // Appliquer la direction RTL/LTR au document
  useEffect(() => {
    const langInfo = LANGUAGES.find(l => l.code === lang)
    document.documentElement.dir = langInfo?.dir || 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((code) => {
    if (!translations[code]) return
    localStorage.setItem(STORAGE_KEY, code)
    setLangState(code)
  }, [])

  // Fonction de traduction : t('key')
  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations['fr']?.[key] ?? key
  }, [lang])

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]

  return (
    <LangContext.Provider value={{ lang, setLang, t, currentLang, LANGUAGES }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
