import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Sprint 16.2: small in-house i18n for staff-facing screens. The
// GM's actual workforce reads English, Spanish, and Mandarin
// Chinese; admin surfaces stay English-only because admins are
// monolingual-English in this property. Three principles:
//
// 1. Flat key namespace ("focused.clock_in"). Nested objects in
//    JSX accessors are tedious; one lookup hides the structure.
// 2. English fallback. Missing es/zh key → en. Missing en key →
//    the key itself (loud + obvious in dev).
// 3. {var} interpolation. No date / plural rules for v1 — staff
//    strings are short and we'll keep it that way.

export const SUPPORTED_LANGS = ['en', 'es', 'zh'];

// Display name + native name per language. Used by the login
// picker so non-English readers see their own script.
export const LANG_LABELS = {
  en: { native: 'English', flag: 'EN' },
  es: { native: 'Español', flag: 'ES' },
  zh: { native: '中文',    flag: '中' },
};

// Translation dict. Keys are organised by surface for searchability.
// Source language is English; es/zh are mirror translations.
const dict = {
  en: {
    // Greetings (focused-action + home)
    'greeting.morning':       'Good morning',
    'greeting.afternoon':     'Good afternoon',
    'greeting.evening':       'Good evening',

    // Focused action screen
    'focused.clock_in':       'Clock In',
    'focused.clock_out':      'Clock Out',
    'focused.sub_in':         'Tap once when you start your shift',
    'focused.sub_out':        'Tap once when your shift ends',
    'focused.skip':           'Just checking, skip',
    'focused.countdown':      'Signing out in {n}s',

    // Auto-sign-out banner
    'auto.in_n':              'Signing out in {n}s',
    'auto.stay':              'Stay signed in',
    'auto.now':               'Sign out now',

    // Home page
    'home.ready':             'Ready when you are.',
    'home.clock':             'Clock',
    'home.this_week':         'This Week',
    'home.recent':            'Recent',
    'home.recent_shifts':     'Recent shifts',
    'home.recent_below_one':  '{n} recent shift below.',
    'home.recent_below_many': '{n} recent shifts below.',
    'home.no_shifts':         'No shifts logged yet.',
    'home.no_shifts_short':   'No shifts yet.',
    'home.loading':           'Loading…',
    'home.on_clock':          'On the clock',
    'home.not_clocked':       'Not clocked in',
    'home.clock_in':          'Clock In',
    'home.clock_out':         'Clock Out',
    'home.just_in':           'Just clocked in',
    'home.just_out':          'Just clocked out',
    'home.elapsed':           'Elapsed',

    // Notifications
    'notif.clocked_in':       'Clocked in!',
    'notif.clocked_out':      'Clocked out!',
    'notif.clock_in_failed':  'Clock in failed',
    'notif.clock_out_failed': 'Clock out failed',

    // Login screen (staff-facing only — admin login stays English)
    'login.title':            'Sign in',
    'login.subtitle':         'Enter your number or PIN',
    'login.enter_pin':        'Enter PIN',
    'login.continue':         'Continue',
    'login.invalid':          'Wrong PIN or number',
    'login.tap_to_start':     'Tap any digit to start',
    'login.language':         'Language',
  },

  es: {
    'greeting.morning':       'Buenos días',
    'greeting.afternoon':     'Buenas tardes',
    'greeting.evening':       'Buenas noches',

    'focused.clock_in':       'Marcar Entrada',
    'focused.clock_out':      'Marcar Salida',
    'focused.sub_in':         'Toca una vez cuando empieces tu turno',
    'focused.sub_out':        'Toca una vez cuando termine tu turno',
    'focused.skip':           'Solo estoy revisando, omitir',
    'focused.countdown':      'Cerrando sesión en {n}s',

    'auto.in_n':              'Cerrando sesión en {n}s',
    'auto.stay':              'Mantener sesión',
    'auto.now':               'Cerrar sesión ahora',

    'home.ready':             'Listo cuando lo estés.',
    'home.clock':             'Reloj',
    'home.this_week':         'Esta Semana',
    'home.recent':            'Reciente',
    'home.recent_shifts':     'Turnos recientes',
    'home.recent_below_one':  '{n} turno reciente abajo.',
    'home.recent_below_many': '{n} turnos recientes abajo.',
    'home.no_shifts':         'Aún no hay turnos registrados.',
    'home.no_shifts_short':   'Aún no hay turnos.',
    'home.loading':           'Cargando…',
    'home.on_clock':          'En turno',
    'home.not_clocked':       'Sin marcar entrada',
    'home.clock_in':          'Marcar Entrada',
    'home.clock_out':         'Marcar Salida',
    'home.just_in':           'Entrada marcada',
    'home.just_out':          'Salida marcada',
    'home.elapsed':           'Tiempo transcurrido',

    'notif.clocked_in':       '¡Entrada marcada!',
    'notif.clocked_out':      '¡Salida marcada!',
    'notif.clock_in_failed':  'Error al marcar entrada',
    'notif.clock_out_failed': 'Error al marcar salida',

    'login.title':            'Iniciar sesión',
    'login.subtitle':         'Ingresa tu número o PIN',
    'login.enter_pin':        'Ingresa tu PIN',
    'login.continue':         'Continuar',
    'login.invalid':          'PIN o número incorrecto',
    'login.tap_to_start':     'Toca cualquier dígito para empezar',
    'login.language':         'Idioma',
  },

  zh: {
    'greeting.morning':       '早上好',
    'greeting.afternoon':     '下午好',
    'greeting.evening':       '晚上好',

    'focused.clock_in':       '上班打卡',
    'focused.clock_out':      '下班打卡',
    'focused.sub_in':         '开始上班时点击一次',
    'focused.sub_out':        '下班时点击一次',
    'focused.skip':           '我只是查看一下，跳过',
    'focused.countdown':      '将在 {n} 秒后退出',

    'auto.in_n':              '将在 {n} 秒后退出',
    'auto.stay':              '保持登录',
    'auto.now':               '立即退出',

    'home.ready':             '随时准备好。',
    'home.clock':             '打卡',
    'home.this_week':         '本周',
    'home.recent':            '最近',
    'home.recent_shifts':     '最近班次',
    'home.recent_below_one':  '下方有 {n} 个最近班次。',
    'home.recent_below_many': '下方有 {n} 个最近班次。',
    'home.no_shifts':         '尚未记录班次。',
    'home.no_shifts_short':   '尚无班次。',
    'home.loading':           '加载中…',
    'home.on_clock':          '在班',
    'home.not_clocked':       '未打卡',
    'home.clock_in':          '上班打卡',
    'home.clock_out':         '下班打卡',
    'home.just_in':           '已打卡上班',
    'home.just_out':          '已打卡下班',
    'home.elapsed':           '已工作',

    'notif.clocked_in':       '上班打卡成功！',
    'notif.clocked_out':      '下班打卡成功！',
    'notif.clock_in_failed':  '上班打卡失败',
    'notif.clock_out_failed': '下班打卡失败',

    'login.title':            '登录',
    'login.subtitle':         '请输入您的号码或密码',
    'login.enter_pin':        '输入密码',
    'login.continue':         '继续',
    'login.invalid':          '号码或密码错误',
    'login.tap_to_start':     '点击任意数字开始',
    'login.language':         '语言',
  },
};

const interpolate = (str, vars) => {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`);
};

// translate(key, lang, vars). Pure function — exported so non-React
// code (e.g. notif helpers) can render strings too.
export const translate = (key, lang, vars) => {
  const langDict = dict[lang] || dict.en;
  const s = (langDict[key] != null ? langDict[key] : dict.en[key]);
  if (s == null) {
    // Loud fallback in dev so missing keys surface immediately.
    return key;
  }
  return interpolate(s, vars);
};

// React integration — provider + hooks. Mounted near the auth
// boundary in App.js so every screen can read the active language.
const STORAGE_KEY = 'hotelops-staff-lang';

const sniffInitial = (override) => {
  if (override && SUPPORTED_LANGS.includes(override)) return override;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  } catch { /* localStorage unavailable */ }
  if (typeof navigator !== 'undefined') {
    const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.includes(browser)) return browser;
  }
  return 'en';
};

const LangContext = createContext({
  lang: 'en',
  setLang: () => {},
});

export const LanguageProvider = ({ children, fromUser }) => {
  const [lang, setLangState] = useState(() => sniffInitial(fromUser));

  // When the authenticated user's preferred_language changes
  // (login/logout/relogin), adopt it. We don't *write* it to
  // localStorage in this branch — the localStorage key is for
  // pre-login picker selections only, so a different staff
  // member at the same kiosk doesn't inherit the previous
  // staff's language as their default.
  useEffect(() => {
    if (fromUser && SUPPORTED_LANGS.includes(fromUser) && fromUser !== lang) {
      setLangState(fromUser);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUser]);

  const setLang = useCallback((l) => {
    if (!SUPPORTED_LANGS.includes(l)) return;
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);

// useT — returns a t(key, vars) function bound to the active
// language. Memoised so children that depend on `t` don't re-render
// gratuitously when lang is unchanged.
export const useT = () => {
  const { lang } = useContext(LangContext);
  return useMemo(() => (key, vars) => translate(key, lang, vars), [lang]);
};
