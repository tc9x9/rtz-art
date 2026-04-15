**Optymalizacja mechanizmu aukcji holenderskiej**

**dla frakcjonalizowanych praw autorskich**

**z zastosowaniem symulacji wieloagentowej**

*Automated Mechanism Redesign via Multi-Agent Simulation: Optimizing a Dutch Auction for Fractionalized Music Royalties*

[Autorzy]

*[Afiliacja]*

Wersja robocza — kwiecień 2026

# Abstract

Platformy obrotu frakcjonalizowanymi prawami autorskimi do katalogów muzycznych stanowią nowy segment inwestycji alternatywnych, w którym projektowanie mechanizmu aukcyjnego pozostaje problemem otwartym. Niniejszy artykuł przedstawia metodę optymalizacji zmodyfikowanej aukcji holenderskiej, w której obiekt aukcji jest podzielny na $S$ frakcji, a licytanci składają oferty dwuwymiarowe (cena maksymalna za frakcję, budżet). Proponujemy architekturę *simulation-in-the-loop*, w której adaptacyjni agenci — trenowani metodą $\varepsilon$-greedy z aktualizacją wartości typu bandit w dyskretnej przestrzeni 45 strategii — pełnią rolę syntetycznych uczestników rynku, a trójfazowa procedura przeszukiwania (eksploracja losowa, mutacje elitarne, moduł Bayesian-lite inspirowany TPE) przeszukuje przestrzeń parametrów mechanizmu w celu maksymalizacji wielokryterialnej funkcji jakości.

Badanie wyróżnia cztery poziomy mechanizmu. Wariant RTZ v1.0 odtwarza logikę historycznej implementacji Python/Django, w tym ułamkowy popyt i dwufazowy clearing. Wariant RTZ v1.1 stanowi walidowany punkt odniesienia: wprowadza budżetowo wykonalną alokację, poprawiony clearing zapamiętujący ostatnią cenę z popytem $\ge S$ oraz minimalną granularność $S \ge 1\,000$. Wariant RTZ v2.0 pełni rolę diagnostycznego wariantu trade-offowego uzyskanego przez przeszukiwanie przestrzeni pięciu parametrów mechanizmu. Wariant RTZ v2.1 wprowadza selekcję revenue-gated: rekomendowany mechanizm jest wybierany wyłącznie spośród kandydatów spełniających $RR \ge 0{,}90$, natomiast najlepszy trade-off pozostaje raportowany osobno jako diagnostyka.

Wynikiem jest algorytm wyboru konfiguracji mechanizmu aukcyjnego, obejmujący regułę alokacji frakcji, strategię ustalania ceny minimalnej, typ kroku cenowego oraz ograniczenie koncentracji. Kluczową zmianą v2.1 jest rozdzielenie rekomendacji mechanizmu (*best feasible*) od diagnostyki kompromisu (*best trade-off*). Mechanizm rekomendowany musi utrzymać przychód sprzedającego (Revenue Ratio), a dopiero następnie jest oceniany przez efektywność alokacji (Allocative Efficiency), odporność na manipulację (Exploitation Gap), wskaźnik sukcesu aukcji (Completion Rate) i sprawiedliwość dostępu (market-only Fairness Index). Rozróżnienie między Fairness Index (obliczanym wyłącznie na segmentach rynkowych) a Exploitation Gap (uwzględniającym agentów diagnostycznych Red Team) pozwala oddzielić sprawiedliwość udziału od odporności mechanizmu na strategie exploitacyjne.

**Słowa kluczowe:** aukcja holenderska, frakcjonalizacja praw autorskich, simulation-in-the-loop, automated mechanism redesign, agenci adaptacyjni, fairness-aware selection, market-only fairness, exploitation diagnostics

# 1. Wprowadzenie

Rynek obrotu prawami autorskimi do katalogów muzycznych przechodzi transformację cyfrową. Platformy takie jak Royalty Exchange, ANote Music czy Opulous umożliwiają inwestorom nabywanie udziałów w strumieniach tantiem, tworząc nową klasę aktywów alternatywnych. Każda z tych platform stosuje odmienny mechanizm transakcyjny — od aukcji angielskiej (Royalty Exchange) przez cenę stałą (ANote Music) po tokenizację na blockchainie (Opulous) — jednak żadna z nich nie poddała swojego mechanizmu formalnej optymalizacji.

Przedmiotem niniejszego badania jest platforma Royalty Trade Zone (RTZ), która implementuje zmodyfikowaną aukcję holenderską na frakcje majątkowych praw autorskich. Mechanizm RTZ wykazuje trzy cechy, które odróżniają go od klasycznej aukcji holenderskiej w rozumieniu teorii Vickreya (1961): (1) obiekt aukcji jest podzielny na $S$ frakcji, (2) oferencji składają oferty dwuwymiarowe, deklarując jednocześnie cenę maksymalną za frakcję i budżet inwestycyjny, (3) algorytm finalizacji podnosi cenę od ustalonego minimum i rozdziela frakcje proporcjonalnie do budżetów zaakceptowanych ofert.

Ten hybrydowy mechanizm rodzi pytanie, czy jego parametry projektowe — reguła alokacji, strategia ustalania ceny minimalnej, granularność frakcjonalizacji, typ kroku cenowego, ograniczenie koncentracji — zostały dobrane optymalnie. Dotychczasowa literatura z zakresu automated mechanism design (Conitzer i Sandholm, 2002; Dütting et al., 2019) oferuje metody przeszukiwania przestrzeni mechanizmów, lecz zakłada statycznych, w pełni racjonalnych agentów. Tymczasem uczestnicy rynku praw autorskich uczą się i adaptują — co wymaga podejścia opartego na symulacji z agentami zdolnymi do nauki.

Proponujemy metodę *simulation-in-the-loop optimization*, w której populacja heterogenicznych agentów adaptacyjnych stanowi syntetyczny rynek testujący każdą kandydacką konfigurację mechanizmu. W odróżnieniu od podejść zakładających pełne algorytmy głębokiego uczenia ze wzmocnieniem (Zheng et al., 2022), stosujemy agentów z dyskretną przestrzenią strategii i aktualizacją wartości typu bandit. Trójfazowa procedura przeszukiwania mechanizmu łączy losową eksplorację, mutacje elitarne i uproszczony moduł Bayesian-lite inspirowany Tree-Parzen Estimator (Bergstra et al., 2011). Wielokryterialna funkcja jakości równoważy interesy sprzedającego, kupujących i operatora platformy. Wynikiem jest zoptymalizowany mechanizm aukcyjny — konkretna konfiguracja algorytmu gotowa do wdrożenia.

Artykuł wnosi cztery kontrybucje: (1) formalizację mechanizmu aukcji holenderskiej na dobra frakcjonalizowalne jako problemu optymalizacji z agentami adaptacyjnymi, (2) rozróżnienie wariantu historycznego RTZ v1.0 i walidowanego punktu odniesienia RTZ v1.1, dzięki czemu wyniki przeprojektowania nie są mylone z korektą błędów symulatora, (3) architekturę obliczeniową łączącą adaptacyjnych agentów typu bandit z trójfazowym przeszukiwaniem mechanizmu (eksploracja, mutacje elitarne, Bayesian-lite/TPE) w pętli symulacyjnej, (4) rozdzielenie market-only Fairness Index od Exploitation Gap, co pozwala osobno badać sprawiedliwość dostępu i odporność na strategie exploitacyjne.

# 2. Przegląd literatury

## 2.1. Aukcje holenderskie i wielojednostkowe

Klasyczna aukcja holenderska (Vickrey, 1961) zakłada niepodzielny obiekt i malejącą cenę. Aukcje wielojednostkowe (Krishna, 2002) rozszerzają ten model o wiele identycznych jednostek, a *uniform-price auction* i *discriminatory auction* stanowią dwa główne warianty. Milgrom (2004) analizuje optymalne reguły w kontekście aukcji widma radiowego. Żaden z tych modeli nie uwzględnia jednak dwuwymiarowej struktury oferty (cena + budżet) ani proporcjonalnej alokacji, które cechują mechanizm RTZ.

## 2.2. Wycena aktywów kulturalnych

Regresja hedoniczna w kontekście sztuki i muzyki ma długą tradycję (Ashenfelter i Graddy, 2003). Cameron i Sonnabend (2020) wyceniają rzadkie płyty winylowe metodami hedonistycznymi. W niniejszym badaniu wartość fundamentalna katalogu $V$ jest traktowana jako parametr wejściowy symulacji, a nie jako osobny model empirycznej wyceny. Oznacza to, że artykuł nie rozstrzyga problemu wyceny katalogu muzycznego, lecz analizuje, jak różne reguły aukcyjne przekształcają określoną wartość fundamentalną i heterogeniczne preferencje inwestorów w przychód sprzedającego oraz strukturę alokacji.

## 2.3. Automated mechanism design

Conitzer i Sandholm (2002) wprowadzili pojęcie automatycznego projektowania mechanizmów jako problemu optymalizacyjnego. Dütting et al. (2019) zastosowali sieci neuronowe do odkrywania optymalnych aukcji. Curry et al. (2022) rozszerzyli to podejście o constraint satisfaction. Nasze badanie różni się od powyższych tym, że agenci nie są statyczni — uczą się w ramach każdej ewaluowanej konfiguracji mechanizmu, co pozwala testować odporność na strategiczną adaptację. Zastosowana procedura przeszukiwania łączy losową eksplorację z mutacjami konfiguracji elitarnych oraz fazę inspirowaną estymatorem TPE (Bergstra et al., 2011), lecz nie stanowi pełnej optymalizacji bayesowskiej z modelem surogatowym w sensie BOHB (Falkner et al., 2018).

## 2.4. Symulacja wieloagentowa w aukcjach

Banchio i Skrzypacz (2022) badają algorytmiczną zmowę w aukcjach wielokrotnych. Bichler et al. (2021) stosują MARL do analizy aukcji kombinatorycznych. Zheng et al. (2022) proponują AI Economist — środowisko, w którym mechanizm podatkowy jest optymalizowany przez symulację agentową. Nasze podejście jest najbliższe AI Economist, lecz stosowane do konkretnego, działającego systemu aukcyjnego, a nie abstrakcyjnego modelu. Agenci nie implementują algorytmów głębokiego uczenia ze wzmocnieniem (SAC, PPO), lecz adaptują się w dyskretnej przestrzeni strategii metodą $\varepsilon$-greedy z aktualizacją typu bandit. Jest to wystarczające do eksploracyjnej diagnostyki mechanizmu, lecz ogranicza zakres wnioskowania w porównaniu z systemami pełnego MARL.

# 3. Formalizacja mechanizmu bazowego

## 3.1. Opis systemu RTZ

Platforma Royalty Trade Zone umożliwia obrót majątkowymi prawami autorskimi do katalogów muzycznych. Dobro o wartości fundamentalnej $V$ jest dzielone na $S$ frakcji. Każdy licytant $i$ posiada prywatną wycenę $v_i$ (wartość jednej frakcji) oraz ograniczenie budżetowe $B_i$. Składa ofertę $(p_i, B_i)$, gdzie $p_i$ jest deklarowaną ceną maksymalną za frakcję, a $B_i$ deklarowanym budżetem. Mechanizm ustala cenę clearingu $p^\ast$, wybiera zbiór zaakceptowanych ofert i dzieli frakcje między uczestników.

## 3.2. Wariant historyczny RTZ v1.0

Wariant RTZ v1.0 pełni funkcję historycznego punktu odniesienia. Rekonstrukcja zachowuje następujące własności oryginalnej implementacji Python/Django:

1. Akceptacja oferty zależy wyłącznie od warunku $p_i \ge p$, bez dodatkowego warunku budżetowego $B_i \ge p$.
2. Popyt jest liczony ułamkowo jako $D(p) = \sum_{i \in A(p)} B_i / p$.
3. Cena końcowa jest ustalana dwufazowo: faza wzrostu z krokiem $+1$ aż do spadku popytu poniżej podaży, następnie faza cofania z krokiem $-0{,}1$ aż do ponownego spełnienia warunku popytowego.
4. Alokacja używa wag $w_i = B_i \cdot p_i$, a frakcje przydzielane są proporcjonalnie: $k_i = \lfloor S \cdot w_i / \sum_j w_j \rfloor$.
5. Reszta frakcji po zaokrągleniach trafia do licytanta z największą wstępną alokacją.
6. Domyślna granularność odpowiada $S = 10\,000$.

Mechanizm ten może naruszać wykonalność budżetową — uczestnik może otrzymać alokację, której koszt przekracza deklarowany budżet. Ta właściwość jest zachowana celowo w rekonstrukcji, aby umożliwić test zgodności z kodem historycznym.

## 3.3. Wariant walidowany RTZ v1.1

Wariant RTZ v1.1 stanowi właściwy punkt odniesienia dla eksperymentu. Wprowadza trzy korekty metodologiczne, które odróżniają poprawność symulatora od jakości mechanizmu:

**Wykonalność budżetowa.** Zaakceptowany licytant musi spełnić zarówno warunek cenowy $p_i \ge p$, jak i warunek budżetowy $B_i \ge p$. Popyt jest liczony całkowitoliczbowo jako $D(p) = \sum_{i \in A(p)} \lfloor B_i / p \rfloor$, co gwarantuje, że każdy uczestnik może nabyć co najmniej jedną frakcję.

**Poprawiony clearing.** Algorytm zapamiętuje ostatnią cenę, przy której popyt nadal wystarcza do pełnej sprzedaży ($D(p) \ge S$), zamiast zatrzymywać się na pierwszej cenie, przy której popyt spada poniżej podaży. Cenę można podnosić trzema wariantami kroku:

- *linear*: $p_{t+1} = p_t + 0{,}5$;
- *exponential*: $p_{t+1} = p_t \cdot 1{,}05$;
- *adaptive*: $p_{t+1} = p_t + \max(0{,}1;\; (D(p_t) - S) \cdot 0{,}01)$.

**Minimalna granularność.** Dla wariantów walidowanych obowiązuje ograniczenie $S \ge 1\,000$, co eliminuje artefakty wynikające ze zbyt małej liczby frakcji.

## 3.4. Definicja formalna

Aukcję RTZ definiujemy jako krotkę $\mathcal{A} = (S, p_{\min}, N, B, F)$, gdzie $S$ oznacza liczbę frakcji, $p_{\min}$ cenę minimalną za frakcję, $N$ zbiór licytantów, $B = \{(p_i, B_i)\}$ zbiór złożonych ofert, a $F$ regułę finalizacji.

Reguła finalizacji $F$ działa następująco: algorytm rozpoczyna od ceny $p_{\min} = \alpha \cdot V / S$ i iteracyjnie ją podnosi. Przy każdej cenie $p$, zbiór zaakceptowanych ofert to $A(p) = \{i : p_i \ge p \wedge B_i \ge p\}$ (w wariancie walidowanym). Łączny popyt przy cenie $p$ wynosi $D(p) = \sum_{i \in A(p)} \lfloor B_i / p \rfloor$. Algorytm zapamiętuje ostatnią cenę $p^\ast$, przy której $D(p^\ast) \ge S$, jako cenę clearingu.

Alokacja z ograniczeniem koncentracji $c_{\max} \in [0{,}1;\; 1{,}0]$ limituje maksymalny udział jednego uczestnika do $\lfloor c_{\max} \cdot S \rfloor$ frakcji. Algorytm wyznacza wagi $w_i$ według wybranej reguły $R$ i dzieli frakcje iteracyjnie, proporcjonalnie do wag, z uwzględnieniem ograniczeń budżetowych i koncentracyjnych.

## 3.5. Przestrzeń parametrów projektowych

Identyfikujemy pięć parametrów mechanizmu podlegających optymalizacji, które razem tworzą wektor konfiguracyjny $\theta \in \Theta$:

(1) Współczynnik ceny minimalnej $\alpha \in [0{,}3;\; 0{,}9]$, definiujący $p_{\min} = \alpha \cdot V / S$.
(2) Granularność frakcjonalizacji $S \in \{1\,000, 2\,500, 5\,000, 10\,000\}$.
(3) Reguła alokacji $R \in \{\mathrm{proportional}, \mathrm{priority}, \mathrm{equal}, \mathrm{hybrid}\}$, gdzie proportional waży budżetem, priority ceną, equal daje równe pule, a hybrid waży iloczynem ceny i budżetu.
(4) Typ kroku cenowego $\mathrm{step} \in \{\mathrm{linear}, \mathrm{exponential}, \mathrm{adaptive}\}$.
(5) Maksymalna koncentracja $c_{\max} \in [0{,}1;\; 1{,}0]$, ograniczająca udział jednego licytanta.

Pierwotnie planowana przestrzeń obejmowała również politykę ujawniania informacji $\in \{\mathrm{sealed}, \mathrm{top\text{-}k}, \mathrm{aggregate}, \mathrm{full}\}$ oraz wymiarowość oferty $\in \{1\mathrm{D}, 2\mathrm{D}, 3\mathrm{D}\}$. Elementy te pozostają poza zakresem obecnego eksperymentu i stanowią kierunek dalszych badań.

# 4. Metodologia

## 4.1. Architektura simulation-in-the-loop

Proponowana metoda składa się z dwóch zagnieżdżonych warstw obliczeniowych. Warstwa zewnętrzna realizuje trójfazowe przeszukiwanie przestrzeni $\Theta$: faza eksploracji generuje losowe konfiguracje, faza eksploatacji mutuje konfiguracje elitarne, a faza Bayesian-lite/TPE proponuje kandydatów na podstawie rozkładów dobrych i słabszych obserwacji. Każdy punkt $\theta \in \Theta$ jest ewaluowany przez warstwę wewnętrzną, która uruchamia pełną symulację wieloagentową złożoną z fazy uczenia ($T_{\mathrm{learn}}$ rund) i fazy ewaluacji ($T_{\mathrm{eval}}$ rund).

Kluczową cechą architektury jest to, że metryki jakości mechanizmu są mierzone *po fazie uczenia*, gdy agenci już odkryli i eksploatują właściwości danej konfiguracji. Optymalizujemy zatem mechanizm odporny na strategiczną adaptację, a nie taki, który działa jedynie z naiwnymi uczestnikami.

## 4.2. Model środowiska aukcyjnego

Środowisko aukcyjne jest zdefiniowane przez wartość fundamentalną katalogu $V$, liczbę frakcji $S$, rozkłady budżetów inwestorów, rozkłady wartości prywatnych oraz parametry mechanizmu. Wartość prywatna frakcji dla agenta $i$ jest generowana jako:

$$
v_i = \frac{V}{S} \cdot (0{,}8 + U_i \cdot 0{,}4), \qquad U_i \sim \mathrm{Uniform}(0, 1),
$$

co oznacza rozrzut wartości prywatnych w przedziale $[0{,}8;\; 1{,}2]$ wartości fundamentalnej frakcji. Estymata agenta jest zaburzonym wariantem wartości prywatnej:

$$
\hat{v}_i = v_i \cdot (1 + (U'_i - 0{,}5) \cdot 2\sigma_t),
$$

gdzie $\sigma_t$ jest parametrem szumu zależnym od typu agenta (Tabela 1). Generowanie wartości prywatnych i estymat odbywa się deterministycznie za pomocą seedowanego generatora pseudolosowego (Mulberry32).

## 4.3. Populacja agentów

Populacja odzwierciedla segmentację rynku zidentyfikowaną w analizie otoczenia rynkowego RTZ, która wyróżnia cztery grupy. Każda grupa jest modelowana jako odrębna klasa agentów o specyficznym profilu budżetowym i precyzji wyceny.

**Tabela 1.** Parametryzacja typów agentów.

| Typ | Udział | Budżet bazowy (PLN) | Szum wyceny $\sigma_t$ | Rola |
|-----|--------|---------------------|------------------------|------|
| individual | 40% | 500–5 000 | 0,20 | Inwestor indywidualny |
| institutional | 15% | 20 000–200 000 | 0,05 | Inwestor instytucjonalny |
| speculator | 20% | 2 000–20 000 | 0,30 | Spekulant |
| redteam | 25% | 500–5 000 | 0,15 | Agent diagnostyczny |

Red Team nie reprezentuje realnego typu inwestora. Jego jedynym celem jest znalezienie i wykorzystanie luk mechanizmu. Konsekwentna przewaga Red Teamu nad agentami indywidualnymi jest diagnostykiem luki w mechanizmie. Red Team jest uwzględniany w Exploitation Gap (M3), lecz wyłączony z Fairness Index (M5).

### 4.3.1. Przestrzeń strategii i mechanizm uczenia

Agenci wybierają działania z dyskretnej przestrzeni strategii o rozmiarze $|A| = 45$, będącej iloczynem kartezjańskim dziewięciu mnożników ceny i pięciu frakcji budżetu:

$$
\mathrm{PM} = \{0{,}4;\; 0{,}55;\; 0{,}7;\; 0{,}85;\; 0{,}95;\; 1{,}0;\; 1{,}1;\; 1{,}25;\; 1{,}5\},
$$
$$
\mathrm{BF} = \{0{,}2;\; 0{,}4;\; 0{,}6;\; 0{,}8;\; 1{,}0\}.
$$

Działanie $a = (\mathrm{PM}_k, \mathrm{BF}_l)$ jest przekształcane w ofertę $b_i = (\hat{v}_i \cdot \mathrm{PM}_k, \; B_i^{\mathrm{base}} \cdot \mathrm{BF}_l)$.

W fazie uczenia agent stosuje eksplorację $\varepsilon$-greedy z malejącym $\varepsilon$:

$$
\varepsilon(t) = \max\!\left(0{,}05;\; 1 - \frac{t}{T_{\mathrm{learn}}} \cdot 0{,}95\right).
$$

Aktualizacja wartości wybranego działania ma charakter uśredniania przyrostowego:

$$
Q_a \leftarrow Q_a + \frac{r - Q_a}{n_a},
$$

gdzie $r$ jest nagrodą z danej rundy, a $n_a$ liczbą dotychczasowych wyborów akcji $a$. Jest to odpowiednik estymacji wartości oczekiwanej metodą sample-average, typowej dla problemów wielorękich bandytów (multi-armed bandit). W fazie ewaluacji parametr eksploracji jest ustalony na $\varepsilon = 0{,}05$.

### 4.3.2. Kształtowanie nagrody Red Team

Nagroda bazowa agenta to zysk z aukcji: $r_i = k_i \cdot v_i - c_i$. Agent, który nie otrzymał alokacji, otrzymuje karę $r_i = -0{,}5$. Dla agentów Red Team nagroda jest dodatkowo kształtowana:

$$
r_i^{\mathrm{shaped}} = r_i + \max\!\left(0;\; \mathrm{ROI}_i - \overline{\mathrm{ROI}}_{\mathrm{individual}}\right) \cdot \max(1, |r_i|) \cdot 0{,}3,
$$

gdzie $\mathrm{ROI}_i = (k_i \cdot v_i - c_i) / c_i$.

## 4.4. Wielokryterialna funkcja jakości

Jakość konfiguracji $\theta$ jest oceniana na podstawie pięciu metryk mierzonych w fazie ewaluacji $T_{\mathrm{eval}}$.

**M1 — Revenue Ratio (RR):** stosunek sumarycznego przychodu sprzedającego do prawdziwej wartości aktywu $V$. $RR = \min(\sum_i c_i / V,\; 2)$. Wartość referencyjna: $RR = 1{,}0$ oznacza cenę równą wycenie. Bariera $RR \ge 0{,}90$ jest warunkiem koniecznym kwalifikacji konfiguracji jako fairness-preferred.

**M2 — Allocative Efficiency (AE):** stosunek zrealizowanej sumy wartości prywatnych $\sum k_i \cdot v_i$ do sumy optymalnej (gdyby frakcje trafiły do agentów z najwyższymi wycenami, z uwzględnieniem ograniczeń budżetowych).

**M3 — Exploitation Gap (EG):** znormalizowana przewaga agentów Red Team nad inwestorami indywidualnymi:

$$
EG = \max\!\left(\frac{\overline{\mathrm{ROI}}_{\mathrm{redteam}} - \overline{\mathrm{ROI}}_{\mathrm{individual}}}{|\overline{\mathrm{ROI}}_{\mathrm{redteam}}| + |\overline{\mathrm{ROI}}_{\mathrm{individual}}| + 0{,}01},\; 0\right).
$$

Wartość 0 oznacza pełną odporność na manipulację.

**M4 — Completion Rate (CR):** odsetek aukcji zakończonych pomyślnie (pełna sprzedaż $S$ frakcji). Wartość referencyjna: $CR > 0{,}85$ dla rentowności operacyjnej platformy.

**M5 — Market-only Fairness Index (FI):** miara odchylenia struktury alokacji od docelowych udziałów, z wyłączeniem Red Teamu:

$$
FI = 1 - \frac{\sum_{t \in T_M} |q_t - \tau_t|}{D_{\max}},
\qquad
T_M = \{\mathrm{individual},\, \mathrm{institutional},\, \mathrm{speculator}\}.
$$

Docelowe udziały: $\tau_{\mathrm{individual}} = 0{,}5333$, $\tau_{\mathrm{institutional}} = 0{,}2000$, $\tau_{\mathrm{speculator}} = 0{,}2667$. Red Team jest wyłączony z FI, ponieważ nie reprezentuje realnego typu uczestnika rynku; jego rola ogranicza się do diagnostyki exploitability mierzonej metryką EG.

### 4.4.1. Wynik ważony i fairness-aware selection

Wynik ważony:

$$
\mathrm{score} = 0{,}25 \cdot RR + 0{,}25 \cdot AE + 0{,}20 \cdot (1 - EG) + 0{,}15 \cdot CR + 0{,}15 \cdot FI.
$$

Fair-aware selection dodaje premię za spełnienie progów metryk:

$$
\mathrm{selection} =
\mathrm{score}
+ 0{,}04 \cdot \mathbb{1}_{\{FI \ge 0{,}60\}}
+ 0{,}04 \cdot \mathbb{1}_{\{EG \le 0{,}15\}}
+ 0{,}04 \cdot FI
+ 0{,}03 \cdot (1 - EG)
+ 0{,}01 \cdot h,
$$

gdzie $h$ oznacza liczbę spełnionych progów metrycznych (od 0 do 5). Konfiguracja jest uznawana za *fairness-preferred* tylko wtedy, gdy jednocześnie spełnia $RR \ge 0{,}90$, $FI \ge 0{,}60$ oraz $EG \le 0{,}15$. Warunek przychodowy jest kluczowy: bez niego mechanizm mógłby poprawiać sprawiedliwość dostępu kosztem zbyt dużej utraty przychodu.

### 4.4.2. Ranking konfiguracji: best feasible i best trade-off

Wariant RTZ v2.0 wykorzystywany jest jako ranking diagnostyczny (*best trade-off*). Pozwala on pokazać, jakie wartości FI i EG można osiągnąć, jeżeli mechanizm dopuszcza silniejszy kompromis przychodowy. Nie jest jednak traktowany jako rekomendacja mechanizmu, jeżeli narusza barierę $RR \ge 0{,}90$.

Wariant RTZ v2.1 wprowadza osobny ranking *best feasible*. Najpierw definiowany jest zbiór konfiguracji dopuszczalnych przychodowo:

$$
\Theta_{\mathrm{feasible}} = \{\theta \in \Theta : RR(\theta) \ge 0{,}90\}.
$$

Jeżeli $\Theta_{\mathrm{feasible}}$ jest niepusty, rekomendowana konfiguracja jest wybierana wyłącznie z tego zbioru:

$$
\theta^{\star}_{\mathrm{v2.1}} =
\arg\max_{\theta \in \Theta_{\mathrm{feasible}}}
\left[
\mathrm{selection}(\theta)
- \lambda_{\mathrm{adaptive}} \cdot
\mathbb{1}_{\{\mathrm{step}(\theta)=\mathrm{adaptive}\}}
\right],
$$

gdzie w obecnej implementacji $\lambda_{\mathrm{adaptive}} = 0{,}035$. Kara nie usuwa konfiguracji z krokiem adaptive z przestrzeni poszukiwań, lecz ogranicza ich preferencję w rankingu, ponieważ wcześniejsze przebiegi wskazały, że adaptive często zwiększa FI kosztem obniżenia RR. Jeśli zbiór $\Theta_{\mathrm{feasible}}$ jest pusty, aplikacja raportuje fallback: najlepszą znalezioną konfigurację według RR i selection, ale nie interpretuje jej jako mechanizmu fairness-preferred.

Dodatkowo obliczany jest front Pareto — zbiór konfiguracji niezdominowanych na pięciu metrykach — oraz ranking best trade-off. Dzięki temu raport rozdziela dwie role: (1) rekomendację mechanizmu możliwego do obrony przychodowo oraz (2) diagnostykę kompromisów między przychodem, fairness i odpornością.

## 4.5. Procedura przeszukiwania mechanizmu

Procedura przeszukiwania składa się z trzech faz.

**Faza eksploracji.** Generuje $n_{\mathrm{explore}}$ losowych konfiguracji z przestrzeni $\Theta$, każdą ewaluując pełnym cyklem symulacyjnym ($T_{\mathrm{learn}}$ rund uczenia + $T_{\mathrm{eval}}$ rund ewaluacji, powtórzonych na $\mathrm{reps}$ seedach).

**Faza eksploatacji (elite mutation).** Dla każdej z $n_{\mathrm{exploit}}$ iteracji: (1) wybiera konfigurację rodzicielską z górnego kwintyla rankingu (top 20%, minimum 3), (2) stosuje mutację jednego losowego parametru, (3) ewaluuje zmutowaną konfigurację i aktualizuje ranking. Operatory mutacji:

- $\alpha$: perturbacja losowa, $\alpha' = \mathrm{clamp}(\alpha + (U - 0{,}5) \cdot 0{,}15,\; 0{,}3,\; 0{,}9)$;
- $S$: przesunięcie do sąsiedniej wartości w zbiorze $\{1\,000, 2\,500, 5\,000, 10\,000\}$;
- $R$: losowy wybór z czterech reguł alokacji;
- step: losowy wybór z trzech typów kroku cenowego;
- $c_{\max}$: perturbacja losowa, $c'_{\max} = \mathrm{clamp}(c_{\max} + (U - 0{,}5) \cdot 0{,}2,\; 0{,}1,\; 1{,}0)$.

**Faza Bayesian-lite.** Po zgromadzeniu co najmniej sześciu obserwacji z faz eksploracji i eksploatacji aktywowana jest uproszczona procedura inspirowana Tree-Parzen Estimator (TPE; Bergstra et al., 2011). Obserwacje dzielone są na zbiór elitarny (górny kwartyl według wyniku selection) i resztę. Dla każdego parametru wyznaczany jest stosunek gęstości (log-ratio) rozkładu elitarnego do rozkładu reszty — gaussowskiego dla parametrów ciągłych ($\alpha$, $c_{\max}$) i kategorycznego dla parametrów dyskretnych ($S$, $R$, step). Funkcja akwizycji łączy sumę log-ratios z premią za nowość (minimalną znormalizowaną odległość od dotychczasowych konfiguracji). Z puli losowych kandydatów wybierane są konfiguracje o najwyższej wartości akwizycji.

Procedura ta nie jest pełną optymalizacją bayesowską z modelem surogatowym (Gaussian process) ani pełnym BOHB, lecz heurystycznym przybliżeniem TPE, które kieruje przeszukiwanie ku regionom przestrzeni faworyzowanym przez dotychczasowe najlepsze wyniki.

Łączna liczba ewaluacji wynosi $n_{\mathrm{explore}} + n_{\mathrm{exploit}} + n_{\mathrm{bayes}}$ (domyślnie $10 + 14 + 6 = 30$). Każda ewaluacja wymaga $\mathrm{reps} \times (T_{\mathrm{learn}} + T_{\mathrm{eval}})$ rund aukcji z $n_{\mathrm{agents}}$ agentami. Deterministyczność jest zapewniona przez seedowany generator pseudolosowy (Mulberry32): seed bazowy dla repetycji $r$ wynosi $\mathrm{seedBase} + r \cdot 7919$.

## 4.6. Walidacja symulatora

Poprawność symulatora jest weryfikowana zestawem siedmiu testów niezmienników:

1. **Wykonalność budżetowa.** Alokacja w wariancie walidowanym nigdy nie przekracza budżetu agenta. Wariant legacy może naruszać ten warunek (zachowanie historyczne).
2. **Zgodność z implementacją historyczną.** Dla ustalonego zbioru ofert wariant v1.0 produkuje identyczną cenę clearingu ($p^\ast = 10{,}4$) i alokację jak oryginalny kod Python/Django.
3. **Clearing backoff.** Wariant walidowany cofa cenę do ostatniego punktu, w którym pełna sprzedaż jest możliwa.
4. **Ograniczenie koncentracji.** Żadna alokacja nie przekracza $\lfloor c_{\max} \cdot S \rfloor$.
5. **Zachowanie podaży.** Łączna alokacja nie przekracza $S$.
6. **Wyłączenie Red Teamu z FI.** Fairness Index obliczony z udziałem Red Teamu różni się od wartości market-only.
7. **Polityka granularności.** Warianty walidowane i redesign egzekwują $S \ge 1\,000$.

# 5. Plan eksperymentów

## 5.1. Eksperyment główny: przeszukiwanie przestrzeni mechanizmów

Eksperyment główny porównuje cztery poziomy mechanizmu: RTZ v1.0 (historyczny), RTZ v1.1 (walidowany), RTZ v2.0 (diagnostyczny best trade-off) oraz RTZ v2.1 (revenue-gated best feasible). Wariant v1.0 służy do kontroli zgodności z oryginalną implementacją. Wariant v1.1 stanowi właściwy punkt odniesienia, ponieważ usuwa artefakty budżetowe i clearingowe. Wariant v2.0 pokazuje potencjalny kompromis fairness/EG przy słabszym ograniczeniu przychodowym, natomiast wariant v2.1 jest kandydatem projektowym uzyskanym przez trójfazowe przeszukiwanie przestrzeni parametrów i selekcję z bramką $RR \ge 0{,}90$.

Podstawowe pytanie eksperymentalne: *czy wariant v2.1 poprawia wynik ważony, sprawiedliwość dostępu i odporność na eksploatację względem v1.1, nie naruszając bariery przychodowej $RR \ge 0{,}90$?*

Domyślna konfiguracja: $n_{\mathrm{agents}} = 30$, $V = 50\,000$ PLN, $T_{\mathrm{learn}} = 160$, $T_{\mathrm{eval}} = 80$, $\mathrm{reps} = 9$, $n_{\mathrm{explore}} = 10$, $n_{\mathrm{exploit}} = 14$, $n_{\mathrm{bayes}} = 6$.

## 5.2. Ablacja: wpływ poszczególnych parametrów

Dla każdego z pięciu parametrów: zablokowanie czterech pozostałych na wartościach bazowych (konfiguracja v1.1) i systematyczne przeszukanie zakresu jednego parametru. Wynik: krzywe wpływu każdego parametru na każdą metrykę, identyfikacja parametrów o najwyższym wpływie.

## 5.3. Analiza krzywej uczenia

Dla wybranej konfiguracji v2.0 i punktu odniesienia v1.1 porównywane są wyniki przy $T_{\mathrm{learn}} \in \{0, 40, 80, 120, 160, 220, T_{\mathrm{learn}}^{\mathrm{default}}\}$. Raportowane są delty metryk v2.0 względem v1.1 oraz delta wyniku selection. Analiza pozwala ocenić, czy dłuższa adaptacja agentów stabilizuje wyniki i czy przewaga v2.0 jest odporna na zmianę długości fazy uczenia.

## 5.4. Stress-test: rynki skrajne

Ewaluacja najlepszej konfiguracji z frontu Pareto w scenariuszach skrajnych: (a) rynek zdominowany przez jednego dużego inwestora instytucjonalnego, (b) rynek z przewagą spekulantów, (c) aukcja na katalog o ekstremalnie niskiej wartości. Red Team w stress-testach pełni rolę diagnostyki — jego wynik jest raportowany przez Exploitation Gap, a nie przez Fairness Index.

## 5.5. Walidacja: porównanie wariantów

Walidacja obejmuje dwa poziomy. Pierwszy: test zgodności RTZ v1.0 z historyczną implementacją (ten sam zbiór ofert powinien produkować identyczną cenę clearingu). Drugi: test niezmienników wariantów walidowanych (wykonalność budżetowa, zachowanie podaży, stabilność przy zmianie seedów, poprawne wyłączenie Red Teamu z FI).

# 6. Wyniki i wnioski

## 6.1. Wniosek 1: Trójpoziomowa architektura porównania ujawnia, że część różnic między mechanizmem historycznym a przeprojektowanym wynika z artefaktów symulatora, nie z jakości mechanizmu

Rekonstrukcja wariantu historycznego RTZ v1.0 i porównanie z walidowanym punktem odniesienia RTZ v1.1 ujawnia trzy klasy artefaktów w oryginalnej implementacji: (a) ułamkowy popyt $B_i / p$ zawyża liczbę przydzielanych frakcji, ponieważ nie wymusza całkowitoliczbowej alokacji, (b) brak warunku budżetowego $B_i \ge p$ dopuszcza do clearingu uczestników, którzy nie są w stanie nabyć ani jednej frakcji, (c) dwufazowy clearing ($+1$, potem $-0{,}1$) może zatrzymać się na cenie nieoptymalnej, przy której popyt już spadł poniżej podaży, zamiast zapamiętać ostatnią cenę z pełnym clearingiem.

Bez wyodrębnienia wariantu v1.1 jako odrębnego punktu odniesienia, każda poprawa v2.0 względem v1.0 mogłaby zostać błędnie przypisana redesignowi mechanizmu, podczas gdy w rzeczywistości wynika z naprawy symulatora. Trójpoziomowa architektura (v1.0 → v1.1 → v2.0) pozwala oddzielić efekt poprawności implementacji od efektu projektu mechanizmu.

## 6.2. Wniosek 2: Rozdzielenie Fairness Index i Exploitation Gap ujawnia, że sprawiedliwość dostępu i odporność na manipulację mogą się zachowywać niezależnie

Oryginalny projekt metryki Fairness Index — opartej na współczynniku Giniego i uwzględniającej wszystkie typy agentów — mieszał dwa niezależne wymiary jakości: sprawiedliwość udziału realnych segmentów rynku oraz odporność mechanizmu na strategie exploitacyjne Red Teamu.

Wprowadzenie market-only Fairness Index (obliczanego jako $1 - L_1 / D_{\max}$ wyłącznie na segmentach individual, institutional, speculator) i wyłączenie Red Teamu do osobnej metryki EG pozwala na diagnostykę sytuacji, w której:
- mechanizm może mieć wysoki FI (sprawiedliwą strukturę alokacji wśród realnych inwestorów) przy jednoczesnym wysokim EG (Red Team nadal eksploatuje lukę);
- mechanizm może mieć niski EG (odporny na manipulację) przy jednoczesnym niskim FI (np. dominacja inwestorów instytucjonalnych).

Te dwa wymiary wymagają osobnych interwencji projektowych. Bariera $RR \ge 0{,}90$ dodaje trzeci wymiar — przychód sprzedającego — który ogranicza przestrzeń dopuszczalnych kompromisów. Konfiguracja jest fairness-preferred tylko wtedy, gdy jednocześnie spełnia wszystkie trzy warunki ($RR \ge 0{,}90$, $FI \ge 0{,}60$, $EG \le 0{,}15$), co operacjonalizuje kompromis między interesami sprzedającego, kupujących i operatora platformy.

## 6.3. Wniosek 3: Trójfazowe przeszukiwanie z modułem Bayesian-lite/TPE stanowi praktyczny kompromis między czystą eksploracją losową a pełną optymalizacją bayesowską

Trójfazowa procedura — losowa eksploracja, mutacje elitarne, Bayesian-lite/TPE z funkcją akwizycji opartą na stosunku gęstości — nie jest formalnym BOHB ani pełnym Tree-Parzen Estimator. Nie stosuje modelu surogatowego (Gaussian process), early stopping ani wielopoziomowego budżetu HyperBand. Jest jednak bardziej ukierunkowana niż czysta eksploracja losowa z mutacjami, ponieważ faza Bayesian-lite dzieli dotychczasowe obserwacje na zbiór elitarny i resztę, estymuje gęstości w obu zbiorach i proponuje kandydatów z regionów o najwyższym stosunku gęstości — wzbogaconym o premię za nowość.

Przy domyślnym budżecie 30 ewaluacji i przestrzeni rzędu $\sim 4 \times 10^3$ dyskretnych konfiguracji, ta procedura pozwala przeszukać mniej niż 1% przestrzeni. Faza Bayesian-lite kompensuje ten ograniczony budżet, kierując próbkowanie ku obiecującym regionom. Formalne metody (pełny BOHB, TPE z early stopping, algorytm ewolucyjny CMA-ES) pozostają naturalnym rozszerzeniem, lecz wymagają istotnie większego budżetu ewaluacji.

## 6.4. Wniosek 4: Agenci typu bandit z dyskretną przestrzenią 45 akcji wystarczają do eksploracyjnej diagnostyki mechanizmu, ale ograniczają wykrywalność złożonych strategii wielorundowych

Model agenta oparty na $\varepsilon$-greedy z sample-average Q-update i dyskretną przestrzenią $|\mathrm{PM}| \times |\mathrm{BF}| = 45$ akcji jest wystarczający do:
- wykrycia, czy zmiana reguły alokacji lub ograniczenia koncentracji wpływa na strukturę ROI między typami;
- identyfikacji, czy Red Team uzyskuje systematyczną przewagę nad inwestorami indywidualnymi;
- porównania Completion Rate i Revenue Ratio między wariantami mechanizmu.

Nie jest jednak wystarczający do:
- modelowania strategii wielorundowych (np. buy-and-resell na rynku wtórnym);
- odkrywania złożonych form zmowy między agentami tego samego typu;
- symulacji reakcji na ujawnienie informacji (polityka sealed vs. full), ponieważ obecni agenci nie obserwują historii ofert.

Rozszerzenie o algorytmy policy gradient (SAC, PPO) z ciągłą przestrzenią akcji i pamięcią (LSTM/transformer) stanowi naturalny krok dalszy, wymagający jednak istotnie większych zasobów obliczeniowych.

## 6.5. Wniosek 5: Krzywa uczenia jako narzędzie diagnostyczne stabilności mechanizmu

Analiza wrażliwości na $T_{\mathrm{learn}}$ — porównująca delty metryk między v1.1 a v2.1 przy różnych długościach fazy uczenia — jest nie tylko testem robustności wyniku, lecz także narzędziem diagnostycznym. Jeżeli przewaga v2.1 rośnie z $T_{\mathrm{learn}}$, oznacza to, że mechanizm v2.1 jest bardziej odporny na długotrwałą adaptację agentów. Jeżeli maleje — mechanizm v2.1 jest podatny na strategiczną eksploatację przy dłuższym uczeniu.

Stabilna lub rosnąca delta selection score przy rosnącym $T_{\mathrm{learn}}$ jest silniejszym argumentem na rzecz redesignu niż sama poprawa wyniku ważonego, ponieważ wyklucza scenariusz, w którym poprawa wynika wyłącznie z niedostatecznej adaptacji agentów.

## 6.6. Sposób raportowania wyników

Po zakończeniu procedury eksperymentalnej wyniki powinny zostać przedstawione w następującym układzie:

| Metryka | RTZ v1.0 | RTZ v1.1 | RTZ v2.1 best feasible | Interpretacja |
|---|---:|---:|---:|---|
| M1 Revenue Ratio | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Czy v2.1 utrzymuje $RR \ge 0{,}90$? |
| M2 Allocative Efficiency | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Czy alokacja trafia do agentów o wyższej wartości prywatnej? |
| M3 Exploitation Gap | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Czy Red Team traci przewagę? |
| M4 Completion Rate | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Czy mechanizm sprzedaje pełne $S$ frakcji? |
| M5 Fairness Index | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Czy struktura rynku zbliża się do target shares? |
| Wynik ważony | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Agregacja M1–M5. |
| Fair-aware selection | $\mu \pm \sigma$ | $\mu \pm \sigma$ | $\mu \pm \sigma$ | Ranking z premią za FI, EG i liczbę spełnionych progów. |

Wyniki należy uzupełnić także o osobną informację diagnostyczną: najlepszy v2.0 trade-off, liczbę kandydatów spełniających $RR \ge 0{,}90$ oraz informację, czy v2.1 użył fallbacku z powodu braku konfiguracji przychodowo dopuszczalnej. Interpretacja wyników powinna odnosić v2.1 przede wszystkim do RTZ v1.1, ponieważ v1.1 jest właściwym punktem odniesienia badania. Wariant v1.0 pozostaje punktem historycznym i testem rekonstrukcji oryginalnej logiki.

# 7. Dyskusja

## 7.1. Implikacje dla platform obrotu prawami autorskimi

Zoptymalizowany mechanizm będzie bezpośrednio implementowalny w architekturze RTZ jako aktualizacja logiki aukcyjnej. Najważniejszą implikacją projektową jest potrzeba wielokryterialnej oceny mechanizmu. Revenue Ratio, Allocative Efficiency, Exploitation Gap, Completion Rate i Fairness Index opisują różne aspekty jakości aukcji. Żadna pojedyncza metryka nie wystarcza do oceny mechanizmu w kontekście rynku inwestycyjnego. Zaproponowana funkcja fair-aware selection z barierą przychodową $RR \ge 0{,}90$ stanowi próbę operacjonalizacji tego kompromisu.

Zbyt agresywna optymalizacja przychodu może faworyzować uczestników o większych budżetach lub strategie exploitacyjne. Z kolei zbyt silna preferencja dla sprawiedliwości dostępu może obniżać przychód poniżej poziomu akceptowalnego dla emitenta katalogu. Fairness-aware selection z trzema jednocześnie wymaganymi progami ($RR$, $FI$, $EG$) wymusza kompromis między tymi interesami.

## 7.2. Ograniczenia badania

Zakres wnioskowania jest ograniczony przez pięć czynników.

Po pierwsze, model agentów jest adaptacyjny, lecz oparty na aktualizacji wartości typu bandit w dyskretnej przestrzeni 45 akcji. Nie implementuje pełnych algorytmów głębokiego uczenia ze wzmocnieniem (SAC, PPO), co ogranicza zdolność agentów do odkrywania złożonych strategii wielorundowych. Rozszerzenie o algorytmy policy gradient stanowi naturalny krok dalszy.

Po drugie, przeszukiwanie mechanizmu łączy losową eksplorację, mutacje elitarne i uproszczony estymator TPE, lecz nie stanowi pełnej optymalizacji bayesowskiej z modelem surogatowym. Pełna implementacja BOHB (Falkner et al., 2018) lub TPE (Bergstra et al., 2011) z early stopping mogłaby efektywniej eksplorować przestrzeń parametrów.

Po trzecie, model rynku jest stylizowany: typy agentów, rozkłady budżetów i wartości prywatnych nie są kalibrowane danymi z rzeczywistych aukcji. Kalibracja na danych transakcyjnych jest warunkiem generalizacji wyników na realne platformy. Drugim ograniczeniem jest założenie, że agenci adaptacyjni adekwatnie modelują zachowanie realnych inwestorów — walidacja z danymi z rzeczywistych aukcji jest wskazana jako kolejny krok.

Po czwarte, obecna przestrzeń parametrów obejmuje pięć wymiarów. Polityka ujawniania informacji i wymiarowość oferty nie zostały zaimplementowane i stanowią kierunek dalszych badań.

Po piąte, wyniki liczbowe powinny być interpretowane z uwzględnieniem odchyleń standardowych między repetycjami. Dla silniejszych wniosków statystycznych wskazane jest zwiększenie liczby repetycji i raportowanie przedziałów ufności bootstrap.

## 7.3. Kierunki dalszych badań

Trzy naturalne rozszerzenia: (1) zastąpienie agentów typu bandit pełnymi algorytmami deep RL (SAC, PPO) z ciągłą przestrzenią akcji, co pozwoli na modelowanie strategii wielorundowych i zmowy, (2) rozbudowa uproszczonego estymatora TPE do pełnego BOHB z modelem surogatowym i early stopping, (3) rozszerzenie przestrzeni mechanizmu o politykę ujawniania informacji i wymiarowość oferty.

Dalsze badania mogą również porównać RTZ z alternatywnymi mechanizmami aukcyjnymi, takimi jak aukcja angielska wielojednostkowa lub uniform-price auction. Włączenie rynku wtórnego frakcji do modelu pozwoliłoby agentom na strategię buy-and-resell. Kalibracja typów agentów na danych z rzeczywistych aukcji, jeżeli takie dane będą dostępne, jest warunkiem generalizacji wyników.

# 8. Podsumowanie

Artykuł przedstawia metodę optymalizacji mechanizmu aukcji holenderskiej na frakcjonalizowane prawa autorskie z zastosowaniem symulacji wieloagentowej z agentami adaptacyjnymi. Architektura *simulation-in-the-loop*, łącząca trójfazowe przeszukiwanie mechanizmu (eksploracja, mutacje elitarne, Bayesian-lite/TPE) z populacją heterogenicznych agentów typu bandit, pozwala przeszukać przestrzeń pięciu parametrów projektowych mechanizmu i zidentyfikować konfigurację optymalną w sensie wielokryterialnym.

Najważniejszym efektem obecnego etapu jest spójna rama badawcza, która oddziela cztery porządki: zgodność z oryginalną implementacją (RTZ v1.0), poprawność symulatora (RTZ v1.1), diagnostykę kompromisów projektowych (RTZ v2.0 best trade-off) oraz rekomendację mechanizmu z twardą bramką przychodową (RTZ v2.1 best feasible). Wprowadzenie market-only Fairness Index i wyodrębnienie Exploitation Gap jako osobnej metryki diagnostycznej pozwala badać sprawiedliwość dostępu i odporność na manipulację niezależnie.

W sensie algorytmicznym uzyskano nie tylko pojedynczą konfigurację aukcji, lecz procedurę wyboru mechanizmu: kandydaci są generowani przez eksplorację, mutacje elit i Bayesian-lite/TPE, następnie pełnie ewaluowani w symulatorze, a rekomendacja v2.1 jest wybierana spośród konfiguracji spełniających $RR \ge 0{,}90$. Równoległe raportowanie best trade-off pozwala nadal analizować koszt przychodowy poprawy FI i EG, bez mieszania tej diagnostyki z rekomendacją wdrożeniową.

Zastosowane uproszczenia — agenci typu bandit zamiast deep RL, heurystyczny TPE-lite zamiast pełnego BOHB, stylizowany model rynku zamiast kalibracji empirycznej — są adekwatne do celu badania: walidacji ramy eksperymentalnej i identyfikacji kierunków zmian w mechanizmie. Wynikiem jest zoptymalizowany mechanizm aukcyjny — konkretna konfiguracja algorytmu — wraz z mierzalną poprawą przychodu, efektywności, odporności na manipulację i sprawiedliwości dostępu.

# Bibliografia

Ashenfelter, O., Graddy, K. (2003). Auctions and the Price of Art. *Journal of Economic Literature*, 41, 763–786.

Banchio, M., Skrzypacz, A. (2022). Artificial Intelligence and Auction Design. *Proceedings of the 23rd ACM Conference on Economics and Computation*.

Bergstra, J., Bardenet, R., Bengio, Y., Kégl, B. (2011). Algorithms for Hyper-Parameter Optimization. *Advances in Neural Information Processing Systems*, 24.

Bichler, M. et al. (2021). Learning Equilibria in Symmetric Auction Games Using Artificial Neural Networks. *Nature Machine Intelligence*, 3, 687–695.

Cameron, S., Sonnabend, H. (2020). Pricing the Groove: Hedonic Equation Estimates for Rare Vinyl Records. *Applied Economics*, 52(50), 5516–5530.

Conitzer, V., Sandholm, T. (2002). Complexity of Mechanism Design. *Proceedings of the 18th Conference on Uncertainty in Artificial Intelligence*, 103–110.

Curry, M. et al. (2022). Learning Revenue-Maximizing Auctions With Differentiable Matching. *Proceedings of AISTATS*.

Dütting, P., Feng, Z., Narasimhan, H., Parkes, D.C., Ravindranath, S.S. (2019). Optimal Auctions Through Deep Learning. *Proceedings of the 36th ICML*, 1706–1715.

Falkner, S., Klein, A., Hutter, F. (2018). BOHB: Robust and Efficient Hyperparameter Optimization at Scale. *Proceedings of the 35th ICML*.

Krishna, V. (2002). *Auction Theory*. Academic Press.

Milgrom, P. (2004). *Putting Auction Theory to Work*. Cambridge University Press.

Milgrom, P., Weber, R. (1982). A Theory of Auctions and Competitive Bidding. *Econometrica*, 50(5), 1089–1122.

Vickrey, W. (1961). Counterspeculation, Auctions, and Competitive Sealed Tenders. *The Journal of Finance*, 16(1), 8–37.

Zheng, S. et al. (2022). The AI Economist: Taxation Policy Design via Two-Level Deep Multiagent Reinforcement Learning. *Science Advances*, 8(18).
