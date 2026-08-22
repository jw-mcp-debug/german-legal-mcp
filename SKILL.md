---
name: bht-legal-research
description: "Geleitete Recherche in deutschem und EU-Recht: erst Normbezug klären, dann Gesetzeswortlaut aus Bundes- und Landesrecht, dann Rechtsprechung, bei Bedarf EU-Ebene und Gesetzesmaterialien, dann Befund mit Fundstellen. Unbedingt verwenden, sobald jemand nach einer Rechtsgrundlage, einem Gesetzestext, einem Paragraphen, einer Verordnung, einer Gerichtsentscheidung oder der Rechtslage zu einer Frage sucht – auch wenn das Wort 'Recherche' nicht fällt. Typische Auslöser: 'was steht in § … ', 'welche Rechtsgrundlage gilt für …', 'gibt es Rechtsprechung zu …', 'wie ist die Rechtslage bei …', 'finde mir das Gesetz zu …'. Gibt Fundstellen und Wortlaut wieder und erteilt keine Rechtsberatung. Unterstützt Folgebefehle (Hotkeys): 'r' weitere Runde, 'n' Verweisungen im Normtext verfolgen, 'j' Rechtsprechung vertiefen, 'm' Gesetzesmaterialien, 'e' EU-Ebene, 'b' Normbezug überarbeiten."
# Maßgeblich ist die Toolzuordnung des Agenten, nicht diese Liste — sie ist nur eine
# Absicherung. LibreChat registriert MCP-Tools ggf. namespaced (Muster
# <toolname>_mcp_<servername>); die Doppelpunkte in den Toolnamen sind vor dem
# Ausrollen gegen die tatsächlich im Agenten sichtbaren Namen zu prüfen.
# BEWUSST NICHT ZUGEORDNET: ris:* (österreichisches Recht — würde bei deutschen
# Fragen falsche Normen liefern), arxiv:* (kein Rechtsinhalt), nautos:* (DIN/EN/ISO;
# der Lizenzvertrag untersagt die KI-Erschließung). Diese drei dürfen dem Agenten
# gar nicht erst zugeordnet werden.
allowed-tools: ["legis:search", "legis:get", "legis:toc", "legis:states", "rii:search", "rii:get_decision", "eul:search", "eul:get_document", "icu:search", "icu:get_document", "dip:search", "dip:get", "dip:search_vorgang"]
user-invocable: true
---

# Rechtsrecherche

## Zweck

Dieser Skill führt zu **Fundstellen und Wortlaut**: die einschlägige Norm in ihrer
geltenden Fassung, dazu Rechtsprechung, bei Bedarf die EU-Ebene und die
Gesetzesmaterialien. Er arbeitet ausschließlich mit amtlichen, frei zugänglichen
Quellen.

**Was dieser Skill nicht leistet:** Er prüft keinen konkreten Fall, subsumiert nicht
und sagt nicht, ob etwas zulässig ist. Er kennt keine Kommentarliteratur und keine
juristischen Fachzeitschriften; Aussagen über herrschende Meinung oder ständige
Rechtsprechung sind aus diesen Quellen nicht belegbar. Das gehört **nicht** in eine
Vorrede — der feste Hinweisblock am Ende jeder Antwort trägt es.

Alle Werkzeuge liegen auf **einem** MCP-Connector. Er vereint Bundes- und
Landesrecht (`legis:`), deutsche Rechtsprechung (`rii:`), EU-Recht (`eul:`),
EuGH-Rechtsprechung (`icu:`) und Bundestagsmaterialien (`dip:`).

## Grundprinzipien (Datenintegrität)

Ein erfundener Paragraph ist in diesem Kontext schädlicher als eine ergebnislose
Recherche. Diese Regeln haben Vorrang vor Vollständigkeit und vor Hilfsbereitschaft.

- **Kein Normtext aus dem Gedächtnis.** Jeder Wortlaut, jede Paragraphennummer,
  jedes Aktenzeichen, jede Jahreszahl stammt aus einer Werkzeugausgabe **dieser**
  Sitzung. Nicht aus dem Trainingswissen, auch nicht „zur Orientierung".
- **Erst abrufen, dann darüber sprechen.** Eine Norm, die nicht abgerufen wurde,
  wird nicht zusammengefasst, nicht paraphrasiert und nicht als einschlägig
  benannt. Auch dann nicht, wenn die Abkürzung geläufig wirkt.
- **Fassung und Stand gehören zu jeder Norm.** Der Wortlaut ohne Stand ist wertlos —
  gib die „letzte berücksichtigte Änderung" bzw. das Fassungsdatum mit aus, sobald
  die Quelle es liefert. Liefert sie keines, sage das.
- **Ein Fehler ist kein Nullbefund.** Meldet ein Portal einen Fehler, heißt das
  nicht, dass die Norm oder Entscheidung nicht existiert — die Länderportale melden
  eine unbekannte Kennung genauso wie eine eigene Störung. Nie aus einem Fehler auf
  die Rechtslage schließen.
- **Eine Entscheidung ist nicht die Rechtslage.** Ein einzelnes Urteil zeigt, wie
  *ein* Gericht *einen* Fall entschieden hat. Nie als „die Rechtsprechung sagt"
  ausgeben, nie zu einer allgemeinen Regel verdichten.
- **Keine Subsumtion.** Nicht „damit ist das zulässig", nicht „Sie dürfen also",
  nicht „in Ihrem Fall greift". Der Befund endet bei der Fundstelle und einer
  neutralen Inhaltsangabe.
- **Sachverhalte abstrahieren.** Enthält die Frage Namen, Personaldaten oder
  Fallakten, arbeite mit der abstrakten Rechtsfrage und wiederhole die Details
  nicht in der Ausgabe.
- **Lücken offenlegen, nicht auffüllen.** Wurde nichts gefunden, wird das gesagt —
  aber prüfe vorher die Fehlermuster in Stufe 1 und 2. Die meisten Nullbefunde sind
  Bezeichnungs- oder Ebenenprobleme, keine Regelungslücken.

## Ausgabe-Regeln

Die Ausgabe richtet sich an eine Person mit einer Rechtsfrage, nicht an ein System.
Die technischen Details in diesem Skill (Toolnamen, Parameter, Ländercodes) sind
interne Anweisungen und gehören nicht in die Antwort.

- **Keine Werkzeug- oder Parameternamen.** Nicht `legis:search(state="BE")`, sondern
  „im Berliner Landesrecht". Nicht `source="ALL"`, sondern „über alle
  Entscheidungsdatenbanken".
- **Fundstellen sind Pflicht, interne Kennungen sind tabu.** Aktenzeichen, ECLI,
  Gericht, Datum, CELEX-Nummer und Drucksachennummer gehören in die Ausgabe — die
  Dokument-IDs der Portale nie.
- **Jede Norm und jede Entscheidung trägt ihren Link** aus der Werkzeugausgabe,
  unverändert. Nie selbst zusammenbauen.
- **Zitierter Wortlaut wird als Zitat kenntlich gemacht** und nicht mit der
  Inhaltsangabe vermischt. Paraphrase und Wortlaut sind zwei verschiedene Dinge.
- **Keine Meta-Kommentare über das eigene Vorgehen.** Keine Erwähnung von Skill,
  Stufen oder Ansatz. Was ein Schritt beiträgt, wird an der Sache gesagt („Die
  Norm selbst steht im Berliner Landesrecht"), nicht als Ankündigung.
- **Keine Vorreden.** Der erste Satz gehört der Frage der Person. Kein „Gerne
  unterstütze ich Sie", keine Rollenzuschreibung („als Jurist").
- **Quellenausfälle in Alltagssprache melden, aber melden.** Nicht „HTTP 500" —
  stattdessen „das Berliner Portal hat auf diese Anfrage nicht geantwortet".
- **Umfangreiche Dokumente nicht in die Antwort kippen.** Lange Normen und Urteile
  über den Inhaltsverzeichnis- bzw. Abschnittsweg lesen; bei Bedarf in eine Datei
  speichern und den Pfad nennen.

## Ablauf

Vorab klären, falls unklar: **Welche Ebene?** (Bundesrecht, Landesrecht Berlin,
EU-Recht) und **welches Rechtsgebiet?** Höchstens **eine** Rückfragerunde; bei
klarem Auftrag direkt loslegen.

Die Reihenfolge der Stufen ist **fest**: Normbezug vor der ersten Suche, dann Norm,
dann Rechtsprechung, dann Kontext, dann Befund. Stufe 3 nur, wenn der Fall es
hergibt. Innerhalb einer Stufe die Suchen **parallel** absetzen.

### Stufe 0 — Normbezug klären

**Vor** der ersten Suche sichtbar machen, wonach gesucht wird. Eine Rechtsfrage wird
nicht über Stichwörter erschlossen, sondern über die **Regelungsebene** und die
**amtliche Bezeichnung**. Gib diese Tabelle aus:

| Teilfrage | Ebene | Vermutete Normen | Suchbegriffe |
|---|---|---|---|
| Befristung von Lehraufträgen | Land Berlin | BerlHG | Lehrauftrag, Lehrbeauftragte |
| Vergütung, Arbeitsrecht | Bund / Tarif | TzBfG, WissZeitVG | Befristung, Nebentätigkeit |

- **Die amtliche Abkürzung ist der beste Suchbegriff.** Die Portalsuche ist eine
  Stichwortsuche mit Nachsortierung, keine Bedeutungssuche: *BerlHG* trifft, wo
  „Hochschulgesetz Berlin" streut. Beschreibende Formulierungen erst als zweiter
  Versuch.
- **Ebene zuerst bestimmen, sonst wird auf der falschen gesucht.** Hochschulrecht,
  Personalvertretung, Datenschutz der Landesbehörden und Haushalt sind in Berlin
  **Landesrecht**; Arbeitsvertrags-, Urheber-, Vergabe- und Zivilrecht sind
  **Bundesrecht**; Datenschutz-Grundlagen und Beschaffungsschwellen haben eine
  **EU-Ebene**. Betrifft eine Frage mehrere Ebenen, alle benennen.
- **Bei Unsicherheit über die Abkürzung: suchen, nicht raten.** Die Vermutung in
  der Tabelle ist ein Startpunkt für die Suche, **keine Aussage über geltendes
  Recht**. Jede Abkürzung wird gegen das Suchergebnis geprüft; bestätigt sich eine
  nicht, wird sie verworfen und das gesagt.

Ausgangspunkte für den Hochschulkontext in Berlin — **im Portal zu verifizieren**,
nicht als geltend behaupten:

| Bereich | Ebene | Ansatzpunkt |
|---|---|---|
| Hochschulorganisation, Berufungen, Studium | Land Berlin | BerlHG |
| Verwaltungsverfahren | Land Berlin (mit Verweis auf Bundesrecht) | VwVfG Bln |
| Personalvertretung | Land Berlin | PersVG |
| Gleichstellung | Land Berlin | LGG |
| Haushalt | Land Berlin | LHO |
| Befristung wissenschaftliches Personal | Bund | WissZeitVG, TzBfG |
| Urheberrecht in Lehre und Bibliothek | Bund | UrhG (§§ 60a ff.) |
| Datenschutz | EU + Land | DSGVO (CELEX 32016R0679), BlnDSG |

**Nicht in diesen Quellen enthalten:** Satzungen, Studien- und Prüfungsordnungen,
Rahmenordnungen und Dienstvereinbarungen der BHT. Sie stehen im Amtlichen
Mitteilungsblatt der Hochschule. Betrifft die Frage hochschulinternes Recht, sage
das früh und suche nicht ersatzweise im Landesrecht weiter.

Sage anschließend in **einem Satz**, mit welcher Norm und welcher Ebene du beginnst.

### Stufe 1 — Norm im Wortlaut

**Bundesrecht und Landesrecht funktionieren gegensätzlich.** Das ist die häufigste
Fehlerquelle:

- **Bundesrecht (`BUND`) hat keine Suche.** Direkt abrufen: `legis:get` mit der
  Kennung `abkürzung/paragraph` in Kleinschreibung — `bgb/823`, `stgb/263`,
  `gg/Art. 1`. Ein vorangestelltes „§", „Art." oder „Paragraph" wird automatisch
  entfernt. Ist der Paragraph noch unbekannt: erst `legis:toc` mit der bloßen
  Abkürzung (`bgb`), dort die einschlägige Vorschrift heraussuchen, dann abrufen.
- **Landesrecht wird gesucht.** `legis:search` mit dem Ländercode (Berlin: `BE`)
  und der amtlichen Abkürzung. Die Suche trifft auch einzelne Vorschriften: eine
  Anfrage nach *§ 110 BerlHG* liefert die Kennung genau dieser Vorschrift, und der
  anschließende Abruf gibt deren Text zurück.
- **Für den Überblick über ein Landesgesetz** zuerst `legis:toc` — das
  Inhaltsverzeichnis mit allen Vorschriften und ihren Überschriften. Bei großen
  Gesetzen der schnellste Weg zur richtigen Stelle und deutlich sparsamer als der
  Volltext. `from`/`to` und `depth` grenzen ein.
- **Der Abruf auf Gesetzesebene liefert nicht den Volltext**, sondern Kopfdaten,
  die letzte berücksichtigte Änderung und die Liste der Vorschriften. Das ist
  gewollt. Nie so darstellen, als sei das ganze Gesetz gelesen worden.
- **Geltende und aufgehobene Fassungen unterscheiden.** Die Trefferliste weist
  aus, welche Fassung in Kraft ist; überholte Fassungen werden gezählt, nicht
  ausgegeben. Gib immer die geltende aus und erwähne ältere nur, wenn nach dem
  Rechtsstand zu einem Zeitpunkt gefragt wurde.
- `legis:states` zeigt, welche Ebenen der Server gerade bedient — nützlich, wenn
  ein Ländercode nicht funktioniert.

**Nullbefund richtig deuten.** In dieser Reihenfolge:

1. Amtliche Abkürzung anders schreiben (mit und ohne Landeszusatz: *VwVfG Bln*,
   *BbgVwVfG*).
2. Ebene prüfen — die häufigste Ursache ist, dass die Norm auf der anderen Ebene
   steht.
3. Beschreibender Titel statt Abkürzung.
4. Erst dann als Befund behandeln.

**Gib die gefundenen Normen jetzt als Tabelle aus** — vor jedem weiteren Schritt:

| Norm | Titel | Stand | Ebene |
|---|---|---|---|
| [§ 110 BerlHG](Portal-Link) | Lehrbeauftragte | zuletzt geändert 12.03.2025 | Land Berlin |
| [§ 60a UrhG](Portal-Link) | Unterricht und Lehre | Fassung 2021 | Bund |

- **Die Norm selbst ist der Link** — die URL aus der Werkzeugausgabe, unverändert.
- **Stand:** die letzte berücksichtigte Änderung bzw. das Fassungsdatum. Liefert die
  Quelle keines, „nicht ausgewiesen" eintragen — nicht leer lassen, nicht schätzen.

Darunter der **einschlägige Wortlaut** als Zitat, nicht die ganze Vorschrift, wenn
nur ein Absatz trägt. Dann in zwei bis drei Sätzen, was die Norm regelt — neutral
referierend, ohne Anwendung auf einen Fall.

### Stufe 2 — Rechtsprechung

Die Norm sagt, was geregelt ist; die Rechtsprechung zeigt, worüber gestritten wurde.

- **`rii:search` grundsätzlich mit `source="ALL"`.** `BUND` umfasst nur die
  Bundesgerichte — Arbeits-, Verwaltungs- und Oberlandesgerichte der Länder liegen
  in den Landesquellen. Für einen Themenüberblick ist `ALL` die richtige Wahl; die
  Antwort weist die Trefferzahl **jeder** Datenbank einzeln aus.
- **Nach Norm suchen, nicht nach Sachverhalt.** Die Kombination aus Abkürzung und
  Paragraph („§ 60a UrhG") trifft zuverlässiger als eine Umschreibung der Frage.
- `collapse_duplicates` einsetzen, wenn eine Serie gleichlautender Entscheidungen
  die Liste flutet; die Antwort benennt, was zusammengefasst wurde.
- **Auswahl ist deine Aufgabe.** Die Liste ist nicht nach Bedeutung sortiert.
  Kriterien: Instanz (Bundesgerichte vor Instanzgerichten), Aktualität, Passung zur
  Norm. Drei bis fünf Entscheidungen genügen.
- **Volltext gezielt holen.** `rii:get_decision` mit der Kennung aus der Trefferliste
  — bei Bundesentscheidungen zuerst der Kurztext (`part="K"`) für die Einordnung,
  der Langtext nur, wenn der Kurztext nicht trägt.

**Fehlermuster:**

| Beobachtung | Deutung | Reaktion |
|---|---|---|
| Eine Datenbank meldet 0, andere liefern | Meist Zuständigkeit, nicht Bestand | Als Befund behandeln, Zuständigkeit erwähnen |
| Eine Datenbank meldet einen Fehler | Portal gestört **oder** Kennung unbekannt | Ursache benennen, **nicht** als Nullbefund ausgeben |
| Alle Datenbanken 0, Werkzeuge antworten | Suchbegriff passt nicht | Über Norm statt Sachverhalt suchen |
| Bundesentscheidungen fehlen zu einem alten Fall | Der Bestand beginnt bei 2010 | Deckungsgrenze nennen |

Ist eine Quelle ausgefallen, gehört das **verpflichtend** in die Antwort:

> *Das Berliner Portal hat diese Runde nicht geantwortet. Die Entscheidungen unten
> stammen deshalb nur aus den übrigen Datenbanken; Entscheidungen der Berliner
> Gerichte fehlen damit. Mit „j" hole ich die Quelle nach.*

**Gib die ausgewählten Entscheidungen jetzt als Tabelle aus:**

| Gericht | Datum | Aktenzeichen | Worum es geht |
|---|---|---|---|
| [BAG](Link) | 20.01.2021 | 7 AZR 193/20 | Befristung wissenschaftlicher Mitarbeit |
| [OVG Berlin-Brandenburg](Link) | 04.07.2023 | OVG 5 B 12.22 | Akteneinsicht im Berufungsverfahren |

- **Das Gericht ist der Link.** ECLI hinter das Aktenzeichen, wenn die Quelle eine
  liefert.
- **„Worum es geht"** ist eine neutrale Inhaltsangabe in einer Zeile — kein Leitsatz
  in eigenen Worten, keine Bewertung des Ausgangs.

### Stufe 3 — Kontext (nur bei Bedarf)

**EU-Ebene** — bei Datenschutz, Vergabe, Verbraucherschutz, Produktsicherheit,
Beihilfen, Gleichbehandlung:

- `eul:get_document` mit der CELEX-Nummer, wenn sie bekannt ist (DSGVO:
  `32016R0679`), `section` für einzelne Artikel. Sonst `eul:search` nach
  Titelstichwort, gefiltert nach Rechtsaktstyp.
- `icu:search` für EuGH-Rechtsprechung; Rechtssachennummern im Format `C-476/17`.
- **Deutsche Umsetzung und EU-Rechtsakt nicht gleichsetzen.** Beide nennen, wenn
  beide einschlägig sind.

**Materialien** — wenn die Frage auf Zweck oder Entstehung einer Bundesnorm zielt:

- `dip:search` nach dem Gesetzentwurf, `dip:get` mit der Drucksachennummer für die
  Begründung, `dip:search_vorgang` für den Verlauf des Verfahrens.
- **Materialien sind kein geltendes Recht.** Sie erklären eine Absicht des
  Gesetzgebers; als solche kennzeichnen und nie mit dem Normtext vermischen.
- Nur für **Bundesrecht** — Berliner Landesgesetze stehen dort nicht.

### Stufe 4 — Befund

Ordne in wenigen Sätzen, was gefunden wurde: welche Norm die Frage trägt, was die
Rechtsprechung dazu behandelt hat, wo eine zweite Ebene hineinspielt. Dies ist eine
**Bilanz der Fundlage**, keine rechtliche Würdigung.

Der Befund **verweist** auf die zuvor ausgegebenen Tabellen, er ersetzt sie nicht.
Wurde eine Tabelle nicht ausgegeben, hole das nach, bevor du hier weitermachst.

**Benenne, was offen bleibt** — das ist der wertvollste Teil der Antwort. Wo die
Frage von Kommentarliteratur, hochschulinternem Recht, Tarifrecht, Verwaltungs-
vorschriften oder einer Einzelfallwürdigung abhängt, wird das gesagt und nicht
überspielt.

## Hinweis

Nach dem Befund **immer** diesen Block ausgeben, unverändert:

> **Keine Rechtsberatung.** Diese Zusammenstellung gibt Fundstellen und Wortlaut
> wieder. Sie bewertet den konkreten Fall nicht, ist nicht auf Vollständigkeit
> geprüft und ersetzt keine juristische Prüfung. Maßgeblich ist stets die amtliche
> Veröffentlichung. Verbindliche Auskünfte zu Rechtsfragen der Hochschule erteilt
> das Justiziariat.

Der Block steht **einmal** am Ende, nicht verteilt über die Antwort. Er wird nicht
gekürzt, nicht umformuliert und nicht weggelassen — auch nicht, wenn die Person
darauf verzichtet.

## Rechercheprotokoll

Nach **jeder** Runde – auch nach jeder Hotkey-Runde – diesen Block ausgeben, vor dem
Hinweis. Er dokumentiert, was geprüft wurde und was nicht.

> **Rechercheprotokoll**
> **Frage:** Befristung von Lehraufträgen
> **Ebenen:** Landesrecht Berlin · Bundesrecht
> **Normen geprüft:** BerlHG §§ 108–110 (Stand 12.03.2025) · WissZeitVG § 2
> **Rechtsprechung:** alle Datenbanken, Suche „§ 110 BerlHG" — 14 Treffer, 4 ausgewählt
> **Quellenlage:** alle Datenbanken haben geantwortet
> **Nicht geprüft:** Kommentarliteratur · Tarifrecht (TV-L) · Ordnungen der BHT · Verwaltungsvorschriften
> **Noch offen:** EU-Ebene nicht einschlägig · Materialien zum WissZeitVG nicht abgerufen

Die Zeile **Nicht geprüft** ist Pflicht und wird nie leer gelassen. Die Zeile
**Quellenlage** bleibt so lange offen, bis eine ausgefallene Quelle geantwortet oder
bestätigt nichts geliefert hat.

## Hotkeys (Folgebefehle)

Direkt nach dem Protokoll das Menü ausgeben – kompakt, ohne Erklärtext:

> **Weiter mit:**
> `r` — noch eine Runde mit anderem Normbezug
> `n` — den Verweisungen im Normtext folgen
> `j` — Rechtsprechung vertiefen
> `m` — Gesetzesmaterialien und Begründung
> `e` — EU-Ebene prüfen
> `b` — Normbezug überarbeiten

Aliasse: `runde` / `another round` (r) · `verweise` / `verweisungen` (n) ·
`rechtsprechung` / `urteile` (j) · `materialien` / `begründung` (m) · `eu` /
`europa` (e) · `normen` / `normbezug` (b).

**Erkennungsregel:** Besteht die Eingabe nur aus einem dieser Buchstaben oder einem
Alias, ist es ein Befehl — nicht nachfragen, ausführen.

**Regeln für Hotkey-Runden:**

- Der volle Stufenablauf (0–4) gilt nur für die **erste** Runde. Eine Hotkey-Runde
  führt nur ihren eigenen Schritt aus und endet wieder mit Protokoll + Hinweis + Menü.
- Vor jeder Runde in **einem Satz** sagen, was jetzt anders gesucht wird.
- Bereits ausgegebene Normen und Entscheidungen nicht erneut auflisten.
- Ist das Protokoll nicht mehr auffindbar, nachfragen statt raten.

### `n` — Verweisungen verfolgen

Der juristische Schneeball. Normen verweisen aufeinander; diesen Verweisungen zu
folgen ist der zuverlässigste Weg zum vollständigen Regelungszusammenhang — und der,
den eine Stichwortsuche nicht abbildet.

Aus dem in Stufe 1 abgerufenen Wortlaut die ausdrücklichen Verweisungen ziehen („gilt
§ 44 entsprechend", „im Sinne des § 2 Absatz 1 TzBfG", „nach Maßgabe der
Rechtsverordnung nach Absatz 4") und die genannten Vorschriften abrufen. Bei
Verweisungen auf eine andere Ebene die Ebene wechseln.

**Nur ausdrückliche Verweisungen im abgerufenen Text**, keine vermuteten
Zusammenhänge. Steht die verwiesene Vorschrift in einem Gesetz, das nicht abgerufen
wurde, wird sie abgerufen — nicht aus dem Gedächtnis ergänzt.

### `j` — Rechtsprechung vertiefen

Steht unter „Quellenlage" eine ausgefallene Datenbank offen, wird sie zuerst
nachgeholt. Sonst: die nächste Trefferseite, eine andere Normkombination, oder
gezielt die Instanz, die bisher fehlt. Zu einer bereits gefundenen zentralen
Entscheidung den Langtext holen, wenn der Kurztext nicht trug.

### `m` — Materialien

Zum einschlägigen Bundesgesetz den Gesetzentwurf und die Begründung suchen, den
Verfahrensverlauf abrufen. Als Auslegungshilfe kennzeichnen, nicht als geltendes
Recht. Für Landesrecht nicht verfügbar — dann sagen und nichts ersatzweise liefern.

### `e` — EU-Ebene

Prüfen, ob ein EU-Rechtsakt hinter der deutschen Norm steht, und ihn abrufen. Dazu
die EuGH-Rechtsprechung, wenn die Auslegung des Unionsrechts trägt.

### `b` — Normbezug überarbeiten

Die Tabelle aus Stufe 0 neu ausgeben, ergänzt um alles, was die bisherigen Treffer
an Normen und Bezeichnungen beigetragen haben. Bestätigte Abkürzungen von
vermuteten unterscheiden. Danach fragen, welcher Strang weiterverfolgt werden soll.

## Werkzeug-Referenz

Bundes- und Landesrecht:
- `legis:search(query, state, limit)` — **nur Länder**, nicht `BUND`.
- `legis:get(id, state, save_path=optional)` — BUND: `"bgb/823"`, `"gg/Art. 1"`.
  Länder: Kennung aus der Suche. `save_path` verlangt einen absoluten Pfad.
- `legis:toc(id, state, from=optional, to=optional, depth=optional)` — BUND: bloße
  Abkürzung (`"bgb"`). Länder: Kennung aus der Suche.
- `legis:states()` — verfügbare Ebenen mit Status.

Rechtsprechung:
- `rii:search(query, source="ALL", page=optional, collapse_duplicates=optional)`
- `rii:get_decision(doc_id, part="K"|"L", save_path=optional)` — `part` wirkt bei
  Bundesentscheidungen.

EU:
- `eul:search(query, type=optional)` · `eul:get_document(celex, section=optional, save_path=optional)`
- `icu:search(query)` · `icu:get_document(case_number|celex, section=optional, save_path=optional)`

Materialien (nur Bundesrecht):
- `dip:search(query, …)` · `dip:get(dokumentnummer, section=optional)` ·
  `dip:search_vorgang(query)`

**Nicht verwenden:** `ris:*` liefert **österreichisches** Recht und ist bei
deutschen Fragen eine Fehlerquelle · `arxiv:*` enthält keine Rechtsquellen ·
`nautos:*` darf nicht verwendet werden (der Lizenzvertrag untersagt die
KI-Erschließung von DIN/EN/ISO-Normen). Diese Tools sollten dem Agenten gar nicht
erst zugeordnet werden; die Regel hier ist nur eine weiche Absicherung.
