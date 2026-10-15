// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, the "Test the connection" report, errors of the commands
// and scene actions. Four languages, the four of the Gladys interface; German
// says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './awtrix/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noClock: {
    en: 'No AWTRIX clock found: enter its address in the configuration.',
    fr: 'Aucune horloge AWTRIX trouvée : saisissez son adresse dans la configuration.',
    de: 'Keine AWTRIX-Uhr gefunden: Gib ihre Adresse in der Konfiguration ein.',
    es: 'No se ha encontrado ningún reloj AWTRIX: introduzca su dirección en la configuración.',
  },
  invalidHost: {
    en: 'Address not understood, e.g. 192.168.1.50',
    fr: 'Adresse incomprise, ex. 192.168.1.50',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.50',
    es: 'Dirección no válida, p. ej. 192.168.1.50',
  },
};

// One short explanation per error kind (src/awtrix/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'username or password refused',
    fr: "nom d'utilisateur ou mot de passe refusé",
    de: 'Benutzername oder Passwort abgelehnt',
    es: 'nombre de usuario o contraseña rechazados',
  },
  [ERROR_KINDS.NG]: {
    en: 'AWTRIX NG firmware: not supported, AWTRIX 3 only',
    fr: 'firmware AWTRIX NG : non pris en charge, AWTRIX 3 seulement',
    de: 'Firmware AWTRIX NG: nicht unterstützt, nur AWTRIX 3',
    es: 'firmware AWTRIX NG: no compatible, solo AWTRIX 3',
  },
  [ERROR_KINDS.NOT_AWTRIX]: {
    en: 'no AWTRIX 3 clock at this address',
    fr: "pas d'horloge AWTRIX 3 à cette adresse",
    de: 'keine AWTRIX-3-Uhr unter dieser Adresse',
    es: 'no hay ningún reloj AWTRIX 3 en esta dirección',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'command refused by the clock',
    fr: "commande refusée par l'horloge",
    de: 'Befehl von der Uhr abgelehnt',
    es: 'orden rechazada por el reloj',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report, one line per clock.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    firmware: (version) => `firmware ${version}`,
    app: (app) => `app ${app}`,
    off: 'display off',
    found: (count) => `${count} clock(s) found on the network (mDNS)`,
  },
  fr: {
    ok: 'OK',
    firmware: (version) => `firmware ${version}`,
    app: (app) => `application ${app}`,
    off: 'écran éteint',
    found: (count) => `${count} horloge(s) trouvée(s) sur le réseau (mDNS)`,
  },
  de: {
    ok: 'OK',
    firmware: (version) => `Firmware ${version}`,
    app: (app) => `App ${app}`,
    off: 'Anzeige aus',
    found: (count) => `${count} Uhr(en) im Netzwerk gefunden (mDNS)`,
  },
  es: {
    ok: 'OK',
    firmware: (version) => `firmware ${version}`,
    app: (app) => `aplicación ${app}`,
    off: 'pantalla apagada',
    found: (count) => `${count} reloj(es) encontrado(s) en la red (mDNS)`,
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noClock: {
    en: 'No AWTRIX clock is available.',
    fr: "Aucune horloge AWTRIX n'est disponible.",
    de: 'Keine AWTRIX-Uhr ist verfügbar.',
    es: 'No hay ningún reloj AWTRIX disponible.',
  },
  unknownClock: {
    en: 'This clock is no longer reachable by the integration.',
    fr: "Cette horloge n'est plus joignable par l'intégration.",
    de: 'Diese Uhr ist für die Integration nicht mehr erreichbar.',
    es: 'Este reloj ya no es accesible para la integración.',
  },
  noText: {
    en: 'The text is empty.',
    fr: 'Le texte est vide.',
    de: 'Der Text ist leer.',
    es: 'El texto está vacío.',
  },
  badAppName: {
    en: 'App name: letters, digits, _ and - only, not a built-in app.',
    fr: "Nom d'application : lettres, chiffres, _ et - seulement, pas une application intégrée.",
    de: 'App-Name: nur Buchstaben, Ziffern, _ und -, keine eingebaute App.',
    es: 'Nombre de la aplicación: solo letras, cifras, _ y -, no una aplicación integrada.',
  },
  badSwitchName: {
    en: 'App name: letters, digits, _ and - only.',
    fr: "Nom d'application : lettres, chiffres, _ et - seulement.",
    de: 'App-Name: nur Buchstaben, Ziffern, _ und -.',
    es: 'Nombre de la aplicación: solo letras, cifras, _ y -.',
  },
  badIndicator: {
    en: 'Choose indicator 1, 2 or 3.',
    fr: "Choisissez l'indicateur 1, 2 ou 3.",
    de: 'Wähle Indikator 1, 2 oder 3.',
    es: 'Elija el indicador 1, 2 o 3.',
  },
  failed: {
    en: 'No clock accepted the command.',
    fr: "Aucune horloge n'a accepté la commande.",
    de: 'Keine Uhr hat den Befehl angenommen.',
    es: 'Ningún reloj ha aceptado la orden.',
  },
  updateGladys: {
    en: 'Update Gladys to 5.2.0 or later to send a message from the widget.',
    fr: 'Mettez Gladys à jour (5.2.0 ou plus) pour envoyer un message depuis le widget.',
    de: 'Aktualisiere Gladys auf 5.2.0 oder neuer, um eine Nachricht aus dem Widget zu senden.',
    es: 'Actualice Gladys a la versión 5.2.0 o posterior para enviar un mensaje desde el widget.',
  },
};
