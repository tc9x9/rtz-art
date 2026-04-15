# Analiza repozytorium

Data analizy: 2026-04-14.

## Typ projektu

Repo było luźnym zbiorem plików badawczych bez struktury aplikacji, bez `package.json`, bez konfiguracji frameworka i bez repozytorium git. Główny kod znajduje się w pojedynczym komponencie React:

- `rtz_rebuilt_app_next (1).jsx` - pełna aplikacja/symulator w jednym pliku.

Na tej podstawie przygotowano uruchamialną strukturę Next:

- `app/page.jsx` - skopiowany komponent, oznaczony jako client component.
- `app/layout.jsx` - minimalny layout Next.
- `app/globals.css` - globalne style bazowe.
- `package.json`, `next.config.mjs`, `tsconfig.json`, `next-env.d.ts` - konfiguracja developerska.

## Zawartość merytoryczna

Kod implementuje trzy poziomy porównania:

- `RTZ v1.0 legacy` - rekonstrukcja historycznego baseline'u z `orginal.py`.
- `RTZ v1.1 validated` - poprawiona alokacja budżetowo wykonalna.
- `RTZ v2.0 redesign` - heurystyczne przeszukiwanie mechanizmu z fairness-aware selection.

Najważniejsze elementy symulatora:

- seedowany RNG,
- heterogeniczni adaptacyjni agenci,
- testy niezmienników,
- metryki M1-M5,
- Pareto front,
- ablation study,
- krzywą uczenia `T_learn` vs poprawa metryk,
- interaktywny panel rekomendacji kolejnego eksperymentu,
- eksport CSV, LaTeX, JSON i notatek do artykułu.

## Status decyzji metodologicznych

`RTZ v1.0 legacy` celowo zachowuje zachowania oryginalnego kodu Django:

- akceptacja ofert zależy od `max_fraction_price >= price`, bez warunku `budget >= price`,
- popyt jest liczony jako `max_investment / price`, bez `floor`,
- cena jest ustalana dwufazowo: najpierw krok `+1`, potem cofnięcie `-0.1`,
- alokacja używa wag `max_investment * max_fraction_price`,
- reszta po `int(...)` trafia do bidderów z najwyższą wstępną alokacją,
- domyślna granularność legacy odpowiada `num_fractions = 10000`.

Decyzja "Red Team poza FI" jest spójna w kodzie:

- `FI_TYPE_ORDER` obejmuje tylko `individual`, `institutional`, `speculator`,
- `TYPE_TARGET` nie zawiera `redteam`,
- `fairnessByType` ignoruje alokacje Red Teamu,
- test niezmiennika sprawdza market-only FI.

Polityka granularności jest również obecna:

- `MIN_VALIDATED_FRACTIONS = 1000`,
- `enforceGranularityPolicy` nie zmienia legacy,
- validated/redesign mają wymuszone `S >= 1000`,
- search i ablacja używają zakresów od 1000 wzwyż.

Validated/redesign używają budżetowo wykonalnej alokacji. Clearing zapamiętuje ostatnią cenę z popytem `>= S`, dzięki czemu `M4 Completion Rate` nie zależy od przypadkowego trafienia dokładnie `demand == S`.

Fairness-aware selection ma twardą barierę revenue:

- target `M1 Revenue Ratio` wynosi `RR >= 0.90`,
- konfiguracja może być `fairness-preferred` tylko przy jednoczesnym spełnieniu progów RR, FI i EG,
- wariant z dobrym FI/EG, ale `RR < 0.90`, nie powinien być raportowany jako finalny redesign bez jawnego uzasadnienia trade-offu.

Pipeline generuje też krzywą uczenia. Dla kilku wartości `T_learn` porównuje `RTZ v1.1 validated` z wybraną konfiguracją `RTZ v2.0`, a następnie raportuje delty M1-M5, `scoreDelta` i `selectionDelta`. Dla `EG` dodatnia delta oznacza poprawę, czyli spadek exploitation gap.

Po runie UI generuje rekomendację kolejnego eksperymentu. Heurystyka zwiększa search, `T_eval`, `T_learn` albo `reps` zależnie od naruszeń progów RR/CR, relacji selection score do validated, odchyleń standardowych i kształtu krzywej uczenia.

UI utrzymuje także historię ostatnich runów w stanie sesji i pozwala wykonać rekomendowany kolejny eksperyment jednym kliknięciem. To jest pętla human-in-the-loop: aplikacja proponuje i może uruchomić następny run po świadomej akcji użytkownika. Opcjonalny autopilot wykonuje od 1 do 50 rekomendowanych przebiegów po jednym kliknięciu i zatrzymuje się po bieżącym runie, jeśli użytkownik wybierze stop.

Kontroler budżetu eksperymentalnego klasyfikuje następny krok jako `learning-limited`, `evaluation-noise-limited`, `search-limited`, `revenue-constrained` albo `stable`. Na tej podstawie automatycznie zwiększa `T_learn`, `T_eval`, `reps` albo budżet searchu.

## Główne ryzyka

1. Artykuł jest ambitniejszy niż implementacja.
   Draft nadal mówi miejscami o pełnym BOHB, SAC/PPO i MARL. Kod obecnie realizuje heurystyczny search i agentów bandit/epsilon-greedy.

2. Symulator i UI są w jednym pliku.
   To utrudnia testy jednostkowe, reużycie logiki oraz eksport wyników poza przeglądarką.

3. Brak wyników po aktualnej metodologii.
   `RTZ_PATCH_NOTES.md` wskazuje, że trzeba wykonać pełny rerun po patchach.

4. Brak historii git.
   Katalog nie jest repozytorium git, więc przed dalszymi pracami warto zainicjalizować repo i wykonać pierwszy commit.

## Rekomendacja techniczna

Najpierw ustabilizować aplikację i wyniki, a dopiero potem refaktoryzować:

1. uruchomić `npm install`,
2. sprawdzić `npm run check` i `npm run build`,
3. uruchomić aplikację i wygenerować wyniki,
4. zapisać eksporty w `data/results/`,
5. zaktualizować draft artykułu pod realny zakres implementacji,
6. dopiero wtedy wydzielić silnik symulacji z UI.
