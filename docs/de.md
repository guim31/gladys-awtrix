# AWTRIX 3

Diese Integration verbindet **AWTRIX-3**-Pixeluhren mit Gladys: die Ulanzi
TC001 „Smart Pixel Clock“ und die ESP32-Eigenbauten mit der freien Firmware
AWTRIX 3. Gladys liest und steuert sie im lokalen Netzwerk über ihre
HTTP-API. Keine Cloud, kein Konto, kein MQTT-Broker nötig.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Die Integration
> ist nach der AWTRIX-3-API gebaut und getestet, wie Firmware und
> Dokumentation sie beschreiben, nicht an einer echten Uhr. Sag in den
> [Issues](https://github.com/guim31/gladys-awtrix/issues), was funktioniert
> und was nicht.

AWTRIX und diese Integration sind nicht mit Ulanzi verbunden.

## Überblick

- **Ein Gerät pro Uhr**: Anzeige an/aus, Helligkeit, automatische Helligkeit,
  eine Taste „nächste App“, die angezeigte App und die Sensoren der Uhr
  (Temperatur, Luftfeuchtigkeit, Umgebungshelligkeit, Batterie, WLAN-Signal,
  Betriebszeit).
- **Szenen-Aktionen**: eine Benachrichtigung anzeigen (Text, Farbe, Symbol,
  Dauer, Ton, auf die Taste warten), einen Gladys-Wert auf dem Bildschirm
  halten, die drei farbigen Indikatoren einschalten, die angezeigte App
  wechseln.
- **Ein Dashboard-Widget** mit der angezeigten App, den Sensoren und vier
  Tasten: **Nachricht…**, **Nächste App**, **Anzeige aus** / **Anzeige an**,
  **Ausblenden**.
- Die Uhren werden **von selbst** im Netzwerk gefunden (mDNS) oder über ihre
  Adressen.

## Voraussetzungen

- Gladys Assistant **5.2.0** oder neuer.
- Eine Uhr mit der Firmware **AWTRIX 3**. Die Integration folgt der API von
  0.98, der letzten Version; aktualisiere eine ältere Uhr über ihre
  Weboberfläche. Siehe die
  [AWTRIX-3-Dokumentation](https://blueforcer.github.io/awtrix3/), um eine
  Ulanzi TC001 zu flashen.
- **AWTRIX NG**, die Nachfolge-Firmware (2026), hat eine andere API und wird
  **nicht unterstützt**: Die Integration erkennt sie und meldet es.
- Die Uhr und Gladys im selben lokalen Netzwerk.

## Konfiguration

1. Öffne in Gladys **Integrationen** → **Von GitHub installieren** und gib
   `https://github.com/guim31/gladys-awtrix` ein (oder installiere
   **AWTRIX 3** aus dem Katalog).
2. In der **Konfiguration**:
   - **Uhren im Netzwerk finden** (standardmäßig an): Gladys sucht die Uhren,
     die sich per mDNS melden, und folgt einer Uhr, deren Adresse sich ändert.
   - **Adressen der Uhren**: die IP-Adressen oder Hostnamen deiner Uhren,
     durch Kommas getrennt (`192.168.1.50, 192.168.1.51`). Nützlich, wenn mDNS
     dein Netzwerk nicht durchquert, oder für eine feste Adresse.
   - **Benutzername** und **Passwort**: nur wenn du in der Weboberfläche der
     Uhren „Auth Username“ und „Auth Password“ gesetzt hast. Für alle Uhren
     gleich.
   - **Aktualisierungsintervall**: wie oft die Uhren gelesen werden
     (standardmäßig 30 Sekunden).
   - **Sprache der Funktionsnamen**: die Namen der Funktionen beim Hinzufügen
     eines Geräts und die Meldungen der Integration.
3. Klicke auf **Verbindung testen**: Jede gefundene Uhr wird mit ihrer
   Firmware und der angezeigten App aufgelistet.
4. Füge die Uhren im Reiter **Entdecken** zu Gladys hinzu.

Jede Lesung sind zwei kleine HTTP-Anfragen pro Uhr (`/api/stats` und
`/api/settings`), nacheinander gesendet: Eine Uhr ist ein ESP32 und bedient
nur eine Anfrage auf einmal. Es gibt kein Kontingent; bleib bei einem
Intervall von 15 Sekunden oder mehr.

## Geräte

Jede Uhr ist ein Gerät namens „AWTRIX“ mit dem Ende ihrer Kennung (zum
Beispiel `AWTRIX 3c1a2b`). Seine Identität ist die eigene Kennung der Uhr,
nicht ihre Adresse: Eine neue IP-Adresse behält das Gerät und seinen Verlauf.

| Funktion                | Was sie tut                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Anzeige                 | Schaltet die Matrix ein oder aus. Die Uhr läuft weiter.                                                             |
| Helligkeit              | 0 bis 100 %. Das Einstellen schaltet die automatische Helligkeit aus, sonst würde die Uhr sie sofort überschreiben. |
| Automatische Helligkeit | Die Uhr folgt dem Umgebungslicht.                                                                                   |
| Nächste App             | Eine Taste: zeigt die nächste App, wie die rechte Taste der Uhr.                                                    |
| Aktuelle App            | Die angezeigte App: Time, Date, Temperature, eine eigene App, Notification...                                       |
| Temperatur              | In °C. Nur wenn die Uhr sie meldet (Ulanzi TC001 oder Eigenbau mit Sensor).                                         |
| Luftfeuchtigkeit        | In %. Gleiche Bedingung.                                                                                            |
| Umgebungshelligkeit     | In Lux, vom Lichtsensor der Uhr.                                                                                    |
| Batterie                | In %. Nur Ulanzi TC001.                                                                                             |
| WLAN-Signal (dBm)       | Das von der Uhr empfangene Signal in dBm (−50: ausgezeichnet, −80: schwach).                                        |
| Betriebszeit            | Stunden seit dem letzten Neustart der Uhr.                                                                          |

Das sind die deutschen Namen; die in der Konfiguration gewählte Sprache gibt
„Display“, „Écran“, „Pantalla“...

## Widget

Füge das Widget **AWTRIX-Uhr** zu einem Dashboard hinzu. Es zeigt die
angezeigte App, die Anzeige, die Helligkeit und das WLAN-Signal, dazu
Temperatur und Luftfeuchtigkeit, wenn die Uhr sie hat. Wähle in seinen
Einstellungen eine Uhr oder lass das Feld leer für alle (eine Zeile pro Uhr).

Seine vier Tasten wirken auf die gewählte Uhr oder auf alle:

- **Nachricht…**: öffnet ein Formular (Text, Farbe, Dauer) und zeigt den Text
  auf der Uhr.
- **Nächste App**: die nächste App der Rotation.
- **Anzeige aus** / **Anzeige an**: schaltet die Matrix aus oder wieder ein.
- **Ausblenden**: entfernt eine Benachrichtigung, die auf die Taste wartet.

## Szenen-Aktionen

Jede Aktion zielt auf eine Uhr oder auf alle, wenn das Feld Uhr leer bleibt.
Jede gibt die Zahl der erreichten Uhren zurück („Erreichte Uhren“) und
schlägt fehl, wenn keine sie angenommen hat.

- **Benachrichtigung auf AWTRIX anzeigen**: ein Text, einmal über den Apps
  angezeigt. Optionen: Textfarbe (oder Regenbogen), ein Symbol, die Dauer,
  was ein langer Text tut (läuft einmal ganz durch, läuft für die Dauer,
  läuft nicht), ein Ton, bleiben, bis die mittlere Taste gedrückt wird, die
  Anzeige einschalten, wenn sie aus ist. Tippe `{{` im Text, um einen Wert der
  Szene einzufügen.
- **AWTRIX-Benachrichtigung ausblenden**: entfernt eine Benachrichtigung, die
  auf die Taste wartet.
- **Wert auf AWTRIX anzeigen**: erstellt oder aktualisiert eine eigene App,
  die in der Rotation der Uhr bleibt. Derselbe Name aktualisiert dieselbe
  App. Optionen: Farbe, Symbol, ein Fortschrittsbalken (0-100) und „Entfernen
  nach (Minuten)“: Die App verschwindet, wenn die Szene sie nicht mehr
  aktualisiert, so bleibt nie ein alter Wert auf dem Bildschirm.
- **Wert von AWTRIX entfernen**: entfernt diese eigene App.
- **AWTRIX-Indikator einstellen**: schaltet einen der drei farbigen Punkte
  rechts am Bildschirm ein (1 oben rechts, 2 rechts, 3 unten rechts),
  dauerhaft, blinkend oder pulsierend, oder schaltet ihn aus.
- **Nächste AWTRIX-App**: die nächste App der Rotation.
- **AWTRIX-App anzeigen**: springt zu einer App über ihren Namen (`Time`,
  `Date`, `Temperature`, `Humidity`, `Battery` oder eine eigene App).

**Symbole** sind IDs von LaMetric-Symbolen, die du zuerst auf die Uhr lädst:
Weboberfläche der Uhr, Reiter **Icons**, ID eingeben (zum Beispiel `2422`),
herunterladen. **Töne** sind eine im Feld getippte RTTTL-Melodie
(`beep:d=16,o=6,b=120:c,e`) oder der Name einer Melodiedatei der Uhr (Ordner
MELODIES), gespielt vom Summer der Ulanzi TC001.

## Szenen-Auslöser

Keine. Die Tasten der Uhr melden ihre Betätigung per MQTT oder per HTTP-Aufruf
an eine Adresse, die die Integration aus ihrem Container nicht anbieten kann.
Gladys sieht trotzdem, was die Tasten ändern: Die angezeigte App und die
Anzeige sind Gerätezustände, die du in einer Szene nutzen kannst.

## Szenen-Beispiele

- **Außentemperatur immer auf dem Bildschirm**: Auslöser „ein Gerätewert
  ändert sich“ an deinem Außensensor → Aktion **Wert auf AWTRIX anzeigen**,
  Name `aussen`, Text `{{Wert des Auslösers}} °C` (mit `{{` einfügen), ein
  Thermometer-Symbol, **Entfernen nach** 60 Minuten.
- **Waschmaschine fertig**: Auslöser, wenn die Leistung der Steckdose der
  Waschmaschine unter 5 W fällt → **Benachrichtigung auf AWTRIX anzeigen**
  „Wäsche fertig“, grün, ein Ton, **Bleiben, bis die Taste gedrückt wird**.
- **Nachtmodus**: um 23:00 die **Anzeige** der Uhr ausschalten, um 7:00
  wieder ein. Oder an lassen mit der **Helligkeit** auf 5 %.
- **Tür offen gelassen**: wenn die Haustür aufgeht, **AWTRIX-Indikator
  einstellen** 1 rot, blinkend; wenn sie zugeht, Indikator 1 aus.

## Fehlerbehebung

- **Keine Uhr gefunden**: mDNS durchquert nicht immer WLAN-Zugangspunkte oder
  VLANs. Gib die Adresse der Uhr in **Adressen der Uhren** ein. Die Uhr zeigt
  sie beim Start, und dein Router kennt sie.
- **„antwortet nicht“**: Die Uhr ist aus, in einem anderen Netzwerk, oder
  ihre Adresse hat sich geändert. Mit aktiver Suche sucht Gladys sie alle
  10 Minuten erneut.
- **„Benutzername oder Passwort abgelehnt“**: Die Uhr hat einen „Auth
  Username“; gib denselben Benutzernamen und dasselbe Passwort in der
  Konfiguration ein.
- **„Firmware AWTRIX NG“**: Die Uhr läuft mit AWTRIX NG, nicht unterstützt.
- **Die Temperatur ist zu hoch**: Der Sensor der Ulanzi TC001 wird von der
  Uhr selbst erwärmt. AWTRIX 3 bietet einen Temperaturausgleich in seiner
  Datei `dev.json` (`temp_offset`).
- **Ein Symbol erscheint nicht**: Lade es zuerst auf die Uhr (Weboberfläche,
  Reiter Icons).
- **Mehr Details**: Setze `LOG_LEVEL=debug` für die Integration; die
  Protokolle enthalten nie das Passwort.

## Grenzen

- **Ohne die Hardware entwickelt**: nur mit der dokumentierten API und einer
  simulierten Uhr getestet.
- Nur AWTRIX 3; AWTRIX NG wird nicht unterstützt.
- Kein Auslöser für die Tasten der Uhr (nur MQTT).
- Ein Benutzername und Passwort für alle Uhren.
- Nur einfaches HTTP, wie AWTRIX 3 es bereitstellt: Halte die Uhren in einem
  vertrauenswürdigen Netzwerk.
- Die Helligkeit einer Uhr mit automatischer Helligkeit ändert sich mit dem
  Licht: Gladys zeigt den bei jeder Aktualisierung gelesenen Wert.

Melde ein Problem oder eine Idee in den
[Issues](https://github.com/guim31/gladys-awtrix/issues).
