# Plan dalszych prac

## Etap 0 - stabilizacja repo

- [x] Dodać strukturę Next/React.
- [x] Dodać podstawowe pliki developerskie.
- [x] Dodać miejsce na wyniki eksperymentów: `data/results/`.
- [x] Odtworzyć `RTZ v1.0 legacy` zgodnie z `orginal.py`.
- [x] Dodać MCP server do manipulacji domyślnymi parametrami eksperymentu przez AI.
- [ ] Zainicjalizować git.
- [x] Uruchomić `npm install`.
- [x] Uruchomić `npm run check`.
- [x] Uruchomić `npm run build`.

## Etap 1 - rerun badawczy

- [ ] Uruchomić aplikację lokalnie.
- [ ] Wykonać pełny pipeline z domyślnymi parametrami.
- [ ] Wyeksportować:
  - `rtz_rebuild_results.csv`,
  - `rtz_rebuild_table.tex`,
  - `rtz_rebuild_raw.json`,
  - `rtz_article_notes.txt`.
- [ ] Przenieść eksporty do `data/results/`.
- [ ] Porównać `v1.1 validated` i `v2.0 redesign` na M1-M5.
- [ ] Sprawdzić, czy finalny `v2.0` spełnia barierę `RR ≥ 0.90`.
- [ ] Przeanalizować krzywą uczenia `T_learn` i wskazać, czy dodatkowe rundy poprawiają delty względem validated.
- [ ] Użyć `Start autopilota badawczego`, żeby aplikacja sama wykonała serię: run, interpretacja, zmiana parametrów, nowe seedy, kolejny run.
- [ ] Użyć panelu `Następny eksperyment`, zastosować rekomendowane parametry i wykonać drugi run porównawczy.
- [ ] Porównać wpisy w `Historia iteracji` i wybrać najlepszy kandydat do eksportu wyników.
- [ ] Ostrożnie używać autopilota 1-50 przebiegów tylko przy akceptowalnym koszcie obliczeń.
- [ ] Przy każdej iteracji zapisać diagnozę z `Następny eksperyment`, uzasadnienie zmiany parametrów i informację, czy run był eksploracyjny, czy stabilizacyjny.

## Etap 2 - zgodność artykułu z kodem

- [ ] Zastąpić mocne deklaracje o pełnym MARL opisem `heterogeneous adaptive agents`.
- [ ] Zastąpić deklaracje o pełnym BOHB opisem `heuristic mechanism search`.
- [ ] Dopisać, że FI jest market-only i nie uwzględnia Red Teamu.
- [ ] Dopisać politykę `S ≥ 1000` dla validated/redesign.
- [ ] Raportować główną poprawę względem `RTZ v1.1 validated`, a nie wyłącznie względem legacy.

## Etap 3 - refaktoryzacja kodu

Obecny `app/page.jsx` jest celowo pozostawiony jako działający monolit. Po rerunie warto go rozdzielić:

- `lib/simulation/constants.js`,
- `lib/simulation/auction.js`,
- `lib/simulation/agents.js`,
- `lib/simulation/metrics.js`,
- `lib/simulation/search.js`,
- `lib/simulation/exports.js`,
- `components/*.jsx`.

Dopiero po wydzieleniu logiki warto dodać test runner i testy jednostkowe bez zależności od UI.

## Etap 4 - testy

Priorytetowe testy po refaktoryzacji:

- alokacja validated nigdy nie przekracza budżetu,
- cap koncentracji jest respektowany,
- suma alokacji zgadza się z `tot`,
- Red Team nie wpływa na FI,
- legacy zachowuje historyczne `S`,
- validated/redesign wymuszają `S ≥ 1000`,
- comparator redesignu preferuje fairness-aware selection zgodnie z założeniami.
- fairness-preferred selection nie wybiera konfiguracji z `RR < 0.90`.
- krzywa uczenia poprawnie liczy delty metryk względem validated, z odwróconym znakiem dla EG.
- panel rekomendacji aktualizuje suwaki i nie uruchamia kolejnego eksperymentu automatycznie.
- przycisk `Zastosuj i uruchom` uruchamia kolejny eksperyment tylko po kliknięciu użytkownika.
- autopilot ma limit 1-50 przebiegów i można go zatrzymać po bieżącym runie.
- autopilot nie wymaga zmiany parametrów między runami i może wykonać serię stabilizacyjną.
- kolejne rekomendowane runy przesuwają `seedBase` i `seedSearch`, żeby seria stabilizacyjna nie dawała identycznych wartości.
- kontroler budżetu eksperymentalnego jawnie rozróżnia `T_learn`, `T_eval`, `reps` i search.
- panel hintów wyjaśnia parametry eksperymentu i definicje metryk M1-M5.
- dymki `?` przy suwakach, kartach metryk i tabeli wyników pokazują wzory oraz krótkie objaśnienia interpretacyjne.

## Etap 5 - rozszerzenia badawcze

Te elementy nie są potrzebne do stabilizacji obecnego projektu:

- pełne SAC/PPO,
- prawdziwe BOHB z modelem surogatowym,
- kalibracja danych empirycznych z osobnego pipeline'u,
- headless runner CLI do masowych symulacji,
- porównanie wielu seedów i przedziały ufności dla publikacji.
