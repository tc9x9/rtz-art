# RTZ patch notes

## Wdrożone zmiany
- odtworzone `RTZ v1.0 legacy` zgodnie z `orginal.py`:
  - akceptacja po `max_fraction_price >= price`, bez filtra `budget >= price`
  - popyt ułamkowy `max_investment / price`
  - dwufazowa cena `+1`, potem `-0.1`
  - alokacja po `max_investment * max_fraction_price`
  - reszta frakcji trafia do największego bidderu
  - domyślne `S = 10000`
- poprawione ustalanie ceny dla `validated` / `redesign`: clearing zapamiętuje ostatnią cenę z popytem `>= S`, zamiast kończyć na pierwszym punkcie `demand <= S`, co sztucznie obniżało `M4 Completion Rate`
- zaostrzony target `M1 Revenue Ratio` z `RR ≥ 0.80` do `RR ≥ 0.90`
- fairness-preferred selection wymaga teraz jednocześnie `RR ≥ 0.90`, poprawnego FI i poprawnego EG
- dodana krzywa uczenia: sweep po `T_learn`, porównanie validated vs v2.0 oraz delty M1-M5 / score / selection
- dodany interaktywny panel `Następny eksperyment`, który interpretuje wyniki i jednym kliknięciem ustawia rekomendowane parametry kolejnego runu
- dodana `Historia iteracji` oraz przycisk `Zastosuj i uruchom` do human-in-the-loop eksperymentowania
- dodany przycisk `Start autopilota badawczego`, który startuje serię od aktualnych suwaków, bez wcześniejszego ręcznego runu
- autopilot ma teraz konfigurowalny limit 1-50 przebiegów
- autopilot może kontynuować serię także wtedy, gdy kolejna rekomendacja nie zmienia parametrów; taki run jest traktowany jako potwierdzenie stabilności na nowych seedach
- rekomendacje przesuwają `seedBase` i `seedSearch`, więc kolejne przebiegi stabilizacyjne nie powtarzają deterministycznie tych samych wartości
- dodane stałe hinty UI dla parametrów (`T_learn`, `T_eval`, `reps`, `explore/exploit`, autopilot) i matematyki metryk M1-M5
- hinty rozbudowane o jawne wzory matematyczne oraz dymki `?` przy parametrach, kartach metryk i tabeli wyników
- sekcja `Następny eksperyment` pokazuje każdorazowo diagnozy, uzasadnienie oraz listę konkretnych zmian parametrów
- kontroler budżetu eksperymentalnego rozróżnia `learning-limited`, `evaluation-noise-limited`, `search-limited`, `revenue-constrained` i `stable`
- dodany lokalny MCP server `rtz-params` do walidowanej manipulacji domyślnymi parametrami eksperymentu
- enforced `S ≥ 1000` dla `validated` i `redesign`, z pozostawieniem `legacy` bez tej polityki
- Fairness Index liczony wyłącznie dla `individual`, `institutional`, `speculator`
- dodane target shares dla FI:
  - individual `0.5333`
  - institutional `0.2000`
  - speculator `0.2667`
- redesign sortowany fairness-aware comparator zamiast tylko po raw weighted score
- dodane `selectionScore` i `targetHits` do ewaluacji oraz eksportów CSV/LaTeX
- search i ablation dla `numFractions` przeniesione na zakres `1000, 2500, 5000, 10000`
- notatki do artykułu i UI zaktualizowane pod FI bez Red Teamu
- testy niezmienników rozszerzone o:
  - market-only FI
  - politykę granularności
  - parytet legacy z oryginalnym Pythonem
  - cofnięcie validated clearing do pełnej sprzedaży

## Sprawdzenie
- `npm run check`
- `npm run build`

## Nadal do zrobienia
- uruchomić pełny rerun symulacji w aplikacji i zapisać nowe wyniki
- ocenić, czy fairness-aware comparator wymaga dalszego dostrojenia wag/priorytetów po rerunie
