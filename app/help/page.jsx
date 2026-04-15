const pageStyle = {
  minHeight: "100vh",
  background: "#0f0f12",
  color: "#f7f7fa",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  padding: "24px 16px 56px",
};

const shellStyle = {
  maxWidth: 1040,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const cardStyle = {
  background: "#15151b",
  border: "1px solid #2c2c35",
  borderRadius: 8,
  padding: 18,
};

const smallLabelStyle = {
  fontSize: 11,
  color: "#8b7cf6",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 800,
  marginBottom: 8,
};

const h2Style = {
  fontSize: 22,
  lineHeight: 1.25,
  margin: "0 0 10px",
};

const textStyle = {
  color: "#d6d6dd",
  lineHeight: 1.75,
  fontSize: 14,
};

const formulaStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  color: "#f0f0f4",
  background: "#111115",
  border: "1px solid #292932",
  borderRadius: 8,
  padding: "8px 10px",
  lineHeight: 1.55,
  overflowWrap: "anywhere",
  margin: "8px 0",
};

const linkStyle = {
  color: "#bdb5ff",
  textDecoration: "none",
  borderBottom: "1px solid rgba(189,181,255,0.45)",
  fontWeight: 800,
};

function Section({ id, title, children }) {
  return (
    <section id={id} style={cardStyle}>
      <div style={smallLabelStyle}>{id}</div>
      <h2 style={h2Style}>{title}</h2>
      <div style={textStyle}>{children}</div>
    </section>
  );
}

function Formula({ children }) {
  return <div style={formulaStyle}>{children}</div>;
}

function MathBlock({ children }) {
  return (
    <div
      style={{
        ...formulaStyle,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: 18,
        textAlign: "center",
        color: "#ffffff",
        lineHeight: 1.75,
      }}
    >
      {children}
    </div>
  );
}

function Var({ children }) {
  return <span style={{ fontStyle: "italic" }}>{children}</span>;
}

function Sub({ children }) {
  return <sub>{children}</sub>;
}

function KeyValue({ label, children }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #25252b" }}>
      <strong style={{ color: "#fff" }}>{label}</strong>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

export const metadata = {
  title: "Pomoc | RTZ Auction Lab",
  description: "Objaśnienie aplikacji RTZ Auction Lab, metryk, parametrów i procedury eksperymentalnej.",
};

export default function HelpPage() {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <div>
            <div style={smallLabelStyle}>Pomoc</div>
            <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: 0 }}>Jak działa RTZ Auction Lab</h1>
            <p style={{ ...textStyle, margin: "10px 0 0", maxWidth: 840 }}>
              RTZ Auction Lab jest aplikacją badawczą służącą do walidacji i eksperymentalnego przeprojektowania mechanizmu aukcyjnego
              dla frakcjonalizowanych strumieni tantiem. Aplikacja porównuje wariant historyczny, walidowany punkt odniesienia oraz
              wariant przeprojektowany oceniany w symulacji wieloagentowej.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/" style={linkStyle}>Wróć do aplikacji</a>
            <a href="#domain" style={linkStyle}>Rynek</a>
            <a href="#auction" style={linkStyle}>Aukcja</a>
            <a href="#quick-actions" style={linkStyle}>Szybki start</a>
            <a href="#metrics" style={linkStyle}>Metryki</a>
            <a href="#parameters" style={linkStyle}>Parametry</a>
            <a href="#search" style={linkStyle}>Search</a>
            <a href="#hypotheses" style={linkStyle}>Hipotezy</a>
            <a href="#exports" style={linkStyle}>Eksport</a>
          </div>
        </header>

        <Section id="start" title="Struktura strony głównej">
          <p>
            Strona główna jest interfejsem eksperymentalnym. U góry widzisz cel, sposób realizacji i hipotezy, po lewej suwaki eksperymentu,
            a po prawej wyniki kolejnych przebiegów. Aplikacja porównuje trzy wersje mechanizmu: historyczną, walidowaną i przeprojektowaną.
          </p>
          <p>
            W pierwszej kolejności należy sprawdzić trzy kwestie: czy mechanizm utrzymuje przychód sprzedającego, czy alokacja nie premiuje nadmiernie Red Teamu
            oraz czy realne segmenty rynku uzyskują udział zbliżony do docelowej struktury alokacji.
          </p>
        </Section>

        <Section id="domain" title="Kontekst przedmiotu badania">
          <p>
            Przedmiotem symulacji nie jest standardowe dobro jednorazowej konsumpcji, lecz udział w przyszłych przychodach z katalogu muzycznego,
            czyli frakcjonalizowane prawo do strumieni tantiem. Katalog może generować wpływy z odtworzeń, synchronizacji, emisji lub innych form eksploatacji,
            a inwestor nabywa udział w ekonomicznym strumieniu wartości.
          </p>
          <p>
            Taki rynek jest trudniejszy niż klasyczna sprzedaż, bo uczestnicy nie wyceniają tylko dzisiejszej ceny. Każdy buduje własne oczekiwanie:
            jak długo katalog będzie słuchany, jak stabilny jest repertuar, czy popularność będzie wygasać, czy może wzrosnąć po nowym trendzie, serialu albo kampanii.
            Dlatego w symulacji każdy agent ma własną wartość prywatną i budżet.
          </p>
          <KeyValue label="Dobro">
            Katalog muzyczny o wartości fundamentalnej V, podzielony na S frakcji.
          </KeyValue>
          <KeyValue label="Uczestnik">
            Inwestor składa ofertę dwuwymiarową: maksymalną cenę jednej frakcji oraz budżet całkowity.
          </KeyValue>
          <KeyValue label="Problem projektowy">
            Mechanizm musi jednocześnie ustalić cenę, sprzedać frakcje, nie złamać budżetów, ograniczyć koncentrację i nie dać łatwej przewagi strategiom exploitacyjnym.
          </KeyValue>
        </Section>

        <Section id="auction" title="Dlaczego to nie jest klasyczna aukcja holenderska">
          <p>
            W klasycznej aukcji holenderskiej cena spada, aż ktoś ją zaakceptuje. Tutaj sytuacja jest bogatsza: sprzedawanych jest wiele frakcji jednego katalogu,
            a każdy uczestnik ma nie tylko maksymalną cenę, lecz także budżet. To znaczy, że popyt zależy od ceny i od tego, ile frakcji inwestor może realnie kupić.
          </p>
          <p>
            Mechanizm łączy elementy aukcji holenderskiej, aukcji wielojednostkowej oraz reguły alokacji budżetowej.
            Z tego powodu wynik zależy nie tylko od poziomu ceny, lecz także od reguły clearingu, zaokrągleń i sposobu alokacji frakcji.
          </p>
          <KeyValue label="Cena clearingu">
            Cena, przy której mechanizm uznaje, że można rozdzielić frakcje między zaakceptowanych uczestników.
          </KeyValue>
          <KeyValue label="Granularność S">
            Liczba frakcji. Większe S daje drobniejszy podział katalogu, ale zmienia dynamikę popytu i alokacji.
          </KeyValue>
          <KeyValue label="Koncentracja c_max">
            Limit udziału jednego uczestnika. Bez tego ograniczenia duży budżet może prowadzić do nadmiernej koncentracji alokacji.
          </KeyValue>
        </Section>

        <Section id="agents" title="Typy agentów">
          <p>
            Agenci są syntetycznymi uczestnikami rynku. Nie reprezentują konkretnych osób, lecz typowe role inwestycyjne, które mogą reagować inaczej na cenę,
            ryzyko i oczekiwany zwrot.
          </p>
          <KeyValue label="Individual">
            Mniejszy inwestor. Zwykle bardziej wrażliwy na ograniczenia budżetowe i podatny na utratę dostępu, gdy mechanizm faworyzuje uczestników o większych budżetach.
          </KeyValue>
          <KeyValue label="Institutional">
            Większy inwestor. Może mieć większy budżet i stabilniejszą wycenę, więc łatwiej utrzymać obecność w aukcji.
          </KeyValue>
          <KeyValue label="Speculator">
            Uczestnik nastawiony na oportunistyczne wejście w aukcję. Może akceptować większą zmienność, jeżeli relacja ceny do wartości prywatnej jest korzystna.
          </KeyValue>
          <KeyValue label="Red Team">
            Agent diagnostyczny, nie segment rynku. Jego zadaniem jest identyfikacja słabości mechanizmu. Dlatego jest liczony w Exploitation Gap, ale nie w Fairness Index.
          </KeyValue>
        </Section>

        <Section id="hypotheses" title="Cel, realizacja i hipotezy">
          <KeyValue label="Cel badawczy">
            Sprawdzić, czy zmodyfikowana aukcja holenderska dla frakcjonalizowanych praw autorskich może jednocześnie utrzymać przychód sprzedającego,
            poprawić odporność na strategie exploitacyjne i zachować bardziej zrównoważony dostęp dla realnych typów inwestorów.
          </KeyValue>
          <KeyValue label="Sposób realizacji celu">
            Symulator najpierw odtwarza historyczną logikę RTZ v1.0, następnie uruchamia walidowany baseline RTZ v1.1, a na końcu ocenia warianty RTZ v2.1.
            Przeszukiwanie odbywa się przez losową eksplorację, mutacje elit i Bayesian-lite/TPE, a każdy kandydat jest oceniany na populacji agentów uczących się.
          </KeyValue>
          <KeyValue label="H1">
            RTZ v2.1 może poprawić Fairness Index i obniżyć Exploitation Gap względem RTZ v1.1 bez naruszenia bariery przychodowej RR ≥ 0.90.
          </KeyValue>
          <KeyValue label="H2">
            Wydłużenie T_learn oraz kandydaci Bayesian-lite powinny zmniejszać przypadkowość wyboru konfiguracji i stabilizować selection score.
          </KeyValue>
        </Section>

        <Section id="quick-actions" title="Szybkie akcje">
          <KeyValue label="Uruchom eksperyment">
            Wykonuje pełną procedurę eksperymentalną: walidację, v1.0, v1.1, search v2.1, ablację, krzywą uczenia i przygotowanie eksportów.
          </KeyValue>
          <KeyValue label="Autopilot">
            Uruchamia serię kolejnych przebiegów. Po każdym przebiegu aplikacja interpretuje wyniki, proponuje nowe parametry i przesuwa seedy,
            aby ograniczyć powtarzanie tej samej trajektorii losowej.
          </KeyValue>
          <KeyValue label="Stop">
            Zatrzymuje autopilota po bieżącym przebiegu. Trwający eksperyment kończy aktualną ewaluację, aby wyniki nie były ucięte w połowie.
          </KeyValue>
        </Section>

        <Section id="workflow" title="Pipeline obliczeń">
          <ol style={{ marginTop: 0, paddingLeft: 20 }}>
            <li>Testy niezmienników sprawdzają, czy silnik symulacji zachowuje podstawowe własności.</li>
            <li>RTZ v1.0 legacy odtwarza historyczną logikę oryginalnego kodu.</li>
            <li>RTZ v1.1 validated jest właściwym baseline'em badawczym.</li>
            <li>RTZ v2.1 redesign wyznacza kandydacką konfigurację mechanizmu z bramką przychodową RR ≥ 0.90.</li>
            <li>Ablacja pokazuje, które parametry mechanizmu wpływają na wynik.</li>
            <li>Krzywa uczenia sprawdza, czy dłuższe uczenie agentów zmienia metryki.</li>
            <li>Eksport zapisuje CSV, LaTeX i JSON.</li>
          </ol>
        </Section>

        <Section id="redesign" title="Co oznacza redesign mechanizmu">
          <p>
            Redesign nie oznacza, że aplikacja projektuje nową aukcję od zera. Oznacza wybór parametrów istniejącego mechanizmu:
            ceny minimalnej, liczby frakcji, reguły alokacji, typu kroku cenowego i limitu koncentracji. Celem jest znalezienie konfiguracji,
            która daje lepszy kompromis między przychodem, efektywnością, kompletnością sprzedaży, fairness i odpornością.
          </p>
          <p>
            Najważniejsze jest porównanie v2.1 do v1.1, nie do v1.0. RTZ v1.0 dostarcza rekonstrukcji historycznej, RTZ v1.1 stanowi właściwy baseline badawczy,
            a RTZ v2.1 pozwala ocenić, czy zmiana parametrów mechanizmu poprawia wynik bez nadmiernej utraty przychodu.
          </p>
        </Section>

        <Section id="versions" title="Wersje RTZ">
          <KeyValue label="RTZ v1.0 legacy">
            Historyczny punkt odniesienia. Celem jest zgodność z oryginalną implementacją, nawet jeżeli część zachowania jest problematyczna metodologicznie.
          </KeyValue>
          <KeyValue label="RTZ v1.1 validated">
            Walidowany baseline: poprawia wykonalność budżetową, clearing i minimalną granularność frakcji.
          </KeyValue>
          <KeyValue label="RTZ v2.0 redesign">
            Diagnostyczny wariant trade-offowy. Korzysta z silnika validated, ale może wybrać konfigurację z wysokim FI i niskim RR, dlatego nie jest już główną rekomendacją.
          </KeyValue>
          <KeyValue label="RTZ v2.1 revenue-gated">
            Główny kandydat projektowy. Używa tej samej przestrzeni searchu co v2.0, ale najpierw filtruje kandydatów przez RR ≥ 0.90, a dopiero potem wybiera najlepszy kompromis M1-M5.
          </KeyValue>
          <KeyValue label="Co uzyskaliśmy">
            Nowy algorytm wyboru konfiguracji rozdziela dwie role: best feasible jest rekomendacją mechanizmu, a best trade-off pozostaje diagnostyką kompromisu.
            Dzięki temu aplikacja nie myli konfiguracji atrakcyjnej fairnessowo z konfiguracją dopuszczalną przychodowo.
          </KeyValue>
        </Section>

        <Section id="parameters" title="Parametry sterujące">
          <KeyValue label="Liczba agentów">
            Większa populacja daje bardziej zróżnicowany rynek, ale podnosi koszt symulacji.
          </KeyValue>
          <KeyValue label="Wartość katalogu V">
            Wartość fundamentalna katalogu. Revenue Ratio porównuje przychód aukcji z tą wartością.
          </KeyValue>
          <KeyValue label="T_learn">
            Liczba rund uczenia agentów przed pomiarem. Zwiększaj, gdy wyniki sugerują niedouczenie strategii, np. słaby Completion Rate lub wysoki Exploitation Gap.
          </KeyValue>
          <KeyValue label="T_eval">
            Liczba rund pomiaru po uczeniu. Zwiększaj, gdy wyniki są blisko progów albo mają wysokie odchylenie standardowe.
          </KeyValue>
          <KeyValue label="Repetycje">
            Liczba niezależnych seedów dla jednej konfiguracji. Więcej repetycji daje stabilniejsze średnie i odchylenia.
          </KeyValue>
          <KeyValue label="Eksploracja, eksploatacja, Bayesian-lite">
            To budżet searchu mechanizmu. Eksploracja losuje konfiguracje, eksploatacja mutuje najlepsze, a Bayesian-lite proponuje kandydatów na podstawie historii wyników.
          </KeyValue>
          <KeyValue label="seedBase i seedSearch">
            Seed jest ziarnem generatora pseudolosowego. seedBase steruje losowością populacji, ofert i uczenia w danym przebiegu,
            a seedSearch steruje losowością przeszukiwania konfiguracji. Autopilot przesuwa oba ziarna w kolejnych przebiegach,
            aby ograniczyć powtarzanie tej samej trajektorii losowej.
          </KeyValue>
        </Section>

        <Section id="search" title="Jak działa search v2.1">
          <p>Search składa się z trzech etapów.</p>
          <KeyValue label="1. Random exploration">
            Losuje konfiguracje z przestrzeni parametrów: α, S, reguła alokacji, typ kroku i c_max.
          </KeyValue>
          <KeyValue label="2. Elite mutation">
            Bierze najlepsze konfiguracje i zmienia jeden parametr. To lokalne sprawdzanie okolicy dobrych rozwiązań.
          </KeyValue>
          <KeyValue label="3. Bayesian-lite / TPE-like">
            Dzieli historię wyników na elity i resztę. Kandydat dostaje wyższą ocenę, jeśli wygląda podobnie do elit, inaczej niż słabe konfiguracje i nie powtarza już sprawdzonych punktów.
          </KeyValue>
          <MathBlock>
            <Var>x</Var><sup>*</sup> = arg max<Sub>x</Sub> [ log ℓ(<Var>x</Var>) - log <Var>g</Var>(<Var>x</Var>) + λν(<Var>x</Var>) ]
          </MathBlock>
          <p>
            To nie jest jeszcze pełne BOHB. Każdy kandydat wskazany przez Bayesian-lite nadal jest sprawdzany pełnym symulatorem.
          </p>
          <p>
            W v2.1 ranking działa dwuetapowo: najpierw powstaje ranking best feasible po kandydatkach z RR ≥ 0.90, a osobno raportowany jest best trade-off.
            Reguła kroku adaptive nie jest usunięta, ale dostaje karę ryzyka w rankingu v2.1, ponieważ wcześniejsze przebiegi wskazały, że często poprawiała FI kosztem RR.
          </p>
        </Section>

        <Section id="metrics" title="Metryki i matematyka">
          <KeyValue label="M1 Revenue Ratio">
            <MathBlock>
              RR = min(R / V, 2),&nbsp;&nbsp; R = Σ<Sub>i</Sub> c<Sub>i</Sub>
            </MathBlock>
            Mierzy przychód sprzedającego względem wartości katalogu. Dla wyboru fairness-preferred wymagamy RR &gt;= 0.90.
          </KeyValue>
          <KeyValue label="M2 Allocative Efficiency">
            <MathBlock>
              AE = PV<Sub>realized</Sub> / PV<Sub>opt</Sub>,&nbsp;&nbsp; PV<Sub>realized</Sub> = Σ<Sub>i</Sub> s<Sub>i</Sub>v<Sub>i</Sub>
            </MathBlock>
            Sprawdza, czy frakcje trafiają do uczestników o wysokiej wartości prywatnej przy danych ograniczeniach budżetowych.
          </KeyValue>
          <KeyValue label="M3 Exploitation Gap">
            <MathBlock>
              EG = max( (ROI<Sub>red</Sub> - ROI<Sub>ind</Sub>) / ( |ROI<Sub>red</Sub>| + |ROI<Sub>ind</Sub>| + 0.01 ), 0 )
            </MathBlock>
            Mierzy przewagę Red Teamu nad inwestorami indywidualnymi. Niższa wartość jest korzystna.
          </KeyValue>
          <KeyValue label="M4 Completion Rate">
            <MathBlock>
              CR = N<Sub>cleared</Sub> / T<Sub>eval</Sub>
            </MathBlock>
            Pokazuje, jak często aukcja sprzedaje pełną liczbę frakcji w fazie ewaluacji.
          </KeyValue>
          <KeyValue label="M5 Market-only Fairness Index">
            <MathBlock>
              FI = 1 - [ Σ<Sub>t∈T<Sub>M</Sub></Sub> |q<Sub>t</Sub> - τ<Sub>t</Sub>| ] / D<Sub>max</Sub>
            </MathBlock>
            Mierzy zgodność struktury rynku z docelowymi udziałami typów individual, institutional i speculator. Red Team jest wyłączony.
          </KeyValue>
          <KeyValue label="Selection score">
            <MathBlock>
              score = 0.25RR + 0.25AE + 0.20(1 - EG) + 0.15CR + 0.15FI
            </MathBlock>
            Łączy metryki M1-M5 i dodaje premie za dobry FI, niski EG oraz liczbę spełnionych progów. Konfiguracja nie powinna być traktowana jako finalna,
            jeśli poprawia fairness kosztem spadku RR poniżej 0.90.
          </KeyValue>
        </Section>

        <Section id="results" title="Jak interpretować wyniki">
          <p>
            Porównuj v2.1 przede wszystkim z v1.1 validated. v1.0 jest potrzebne jako historyczna rekonstrukcja, ale nie jest normatywnym baseline'em badawczym.
          </p>
          <p>
            Dobry wynik to nie tylko wysoki selection. W v2.1 podstawowy wybór konfiguracji jest revenue-gated: kandydat powinien spełniać RR ≥ 0.90, a dopiero potem poprawiać Exploitation Gap i Fairness Index.
          </p>
        </Section>

        <Section id="risks" title="Ryzyka interpretacyjne">
          <KeyValue label="Wysoki fairness nie wystarcza">
            Jeżeli FI rośnie, ale RR spada poniżej 0.90, poprawa dostępności jest osiągana kosztem przychodu. To nie jest finalny wariant fairness-preferred.
          </KeyValue>
          <KeyValue label="Niski EG nie oznacza braku strategii">
            Niski Exploitation Gap oznacza, że Red Team nie uzyskał przewagi w tej populacji i przy tych seedach. Nie jest to formalny dowód odporności na wszystkie strategie.
          </KeyValue>
          <KeyValue label="Odchylenie standardowe ma znaczenie">
            Wynik z wysokim sd może być niestabilny. W takiej sytuacji należy zwiększyć T_eval lub reps zamiast wyciągać silne wnioski z pojedynczego przebiegu.
          </KeyValue>
          <KeyValue label="Model jest stylizowany">
            Symulacja pokazuje kierunek projektowy, ale nie zastępuje kalibracji na rzeczywistych danych transakcyjnych i royalty.
          </KeyValue>
        </Section>

        <Section id="validation" title="Walidacja i PASS/FAIL">
          <p>
            Testy walidacyjne sprawdzają podstawowe własności silnika: zgodność legacy z oryginałem, wykonalność budżetową w validated, clearing i poprawne traktowanie Red Teamu.
          </p>
          <p>
            PASS oznacza, że test niezmiennika przeszedł. FAIL oznacza, że wynik eksperymentu trzeba traktować jako niewiarygodny, dopóki silnik nie zostanie poprawiony.
          </p>
        </Section>

        <Section id="ablation" title="Ablacja">
          <p>
            Ablacja zmienia po jednym parametrze i sprawdza wpływ na metryki. Dzięki temu widać, czy wynik v2.1 wynika z całego searchu,
            czy głównie z jednego parametru, np. granularności S, reguły alokacji albo limitu koncentracji.
          </p>
        </Section>

        <Section id="learning" title="Krzywa uczenia">
          <p>
            Krzywa uczenia porównuje wyniki dla różnych wartości T_learn. Jeżeli selection rośnie przy dłuższym uczeniu,
            agenci potrzebują więcej czasu na adaptację. Jeżeli wynik się stabilizuje, dalsze zwiększanie T_learn może być mniej opłacalne niż zwiększenie repetycji.
          </p>
        </Section>

        <Section id="autopilot" title="Autopilot i rekomendacje">
          <p>
            Autopilot działa w pętli: uruchomienie, interpretacja wyników, wybór kolejnych parametrów, przesunięcie seedów, kolejne uruchomienie.
            Uzasadnienia obok rekomendacji mówią, czy problem wygląda na search-limited, learning-limited, revenue-constrained czy evaluation-noise-limited.
          </p>
          <p>
            Po każdym przebiegu aplikacja zapisuje wynik do historii sesji i wyznacza ocenę hipotez H1 oraz H2. H1 dotyczy jednoczesnej poprawy FI,
            obniżenia EG i zachowania bariery RR ≥ 0.90. H2 dotyczy wpływu T_learn, Bayesian-lite i stabilności wyników między przebiegami.
          </p>
          <p>
            Limit autopilota określa długość jednej uruchamianej serii, a nie limit archiwum. Historia iteracji zbiera wszystkie przebiegi z bieżącej sesji,
            wraz z seedBase, seedSearch, metrykami, konfiguracją v2.1 oraz oceną H1/H2.
          </p>
          <p>
            Główne podsumowanie w aplikacji jest agregowane po całej historii autopilota. Pełny zestaw wyników pojedynczego przebiegu otwiera się kliknięciem
            odpowiedniego wiersza w Historii iteracji.
          </p>
          <p>
            Wyniki są zapisywane w pamięci sesji przeglądarki, dlatego przejście na stronę Pomocy i powrót do aplikacji nie usuwa historii.
            Dane pozostają dostępne w tej samej karcie przeglądarki do czasu zamknięcia sesji albo zastąpienia ich nowymi przebiegami.
          </p>
        </Section>

        <Section id="exports" title="Eksport">
          <KeyValue label="CSV">
            Tabela do arkusza kalkulacyjnego lub dalszej analizy statystycznej. Po autopilocie zawiera sekcje AUTOPILOT_RUNS,
            AUTOPILOT_CANDIDATES oraz HYPOTHESES.
          </KeyValue>
          <KeyValue label="LaTeX">
            Tabela wynikowa w składni LaTeX.
          </KeyValue>
          <KeyValue label="JSON">
            Pełny zapis danych, parametrów, konfiguracji i wyników. Eksport JSON zawiera bieżący wynik, ocenę hipotez liczonych po historii oraz pełną historię przebiegów autopilota zapisaną w bieżącej sesji.
          </KeyValue>
        </Section>

        <Section id="limits" title="Ograniczenia">
          <p>
            Obecna wersja nie jest pełnym MARL, pełnym BOHB ani produkcyjnym systemem aukcyjnym. To walidowane laboratorium eksperymentalne.
            Najważniejsze ograniczenia to stylizowany model rynku, agenci bandit zamiast deep RL oraz uproszczony Bayesian-lite zamiast formalnej optymalizacji bayesowskiej.
          </p>
        </Section>

        <footer style={{ ...cardStyle, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#9b9ba6", fontSize: 13 }}>RTZ Auction Lab Help</span>
          <a href="/" style={linkStyle}>Wróć do aplikacji</a>
        </footer>
      </div>
    </main>
  );
}
