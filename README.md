# RTZ Auction Lab

Repo zawiera roboczą aplikację badawczą dla projektu **RTZ Auction Lab**: symulator aukcji holenderskiej dla frakcjonalizowanych praw autorskich, porównujący `RTZ v1.0 legacy`, `RTZ v1.1 validated` i `RTZ v2.0 redesign`.

## Aktualny stan

- Główna aplikacja Next/React: `app/page.jsx`.
- Oryginalny zrzut komponentu: `rtz_rebuilt_app_next (1).jsx`.
- Referencyjny fragment starego backendu Django: `orginal.py`.
- Roboczy draft artykułu: `art-draft.md`.
- Notatki metodologiczne i TODO: `RTZ_CODE_STATUS_AND_TODO.md`, `RTZ_PATCH_NOTES.md`, `RTZ_NEW_CHAT_STARTER.md`.

`RTZ v1.0 legacy` odwzorowuje oryginalny algorytm z `orginal.py`: dwufazowe ustalanie ceny, ułamkowy popyt, brak filtra budżetowego przy akceptacji i przydział reszty największemu bidderowi. Najważniejsza decyzja metodologiczna jest już odzwierciedlona w kodzie: **Red Team nie jest liczony do Fairness Index**. Pozostaje wyłącznie w `EG` / diagnostyce exploitability.

Fairness-aware selection ma barierę przychodową: konfiguracja `v2.0` może dostać priorytet fairness-preferred tylko wtedy, gdy spełnia `M1 Revenue Ratio ≥ 0.90`, oprócz progów FI i EG. Chroni to redesign przed wyborem wariantu, który kupuje fairness zbyt dużym spadkiem revenue.

## Uruchomienie

Wymagania:

- Node.js 20 lub nowszy.
- npm 10 lub nowszy.

Instalacja i start:

```bash
npm install
npm run dev
```

Aplikacja będzie dostępna lokalnie pod adresem wypisanym przez Next, zwykle `http://localhost:3000`.

Walidacja składni:

```bash
npm run check
```

Build produkcyjny:

```bash
npm run build
```

MCP server do manipulacji parametrami przez klienta AI:

```bash
npm run mcp:params
```

Szczegóły konfiguracji są w `docs/MCP_SERVER.md`.

## Co robi aplikacja

Pipeline eksperymentalny obejmuje:

1. testy niezmienników symulatora,
2. ewaluację `RTZ v1.0 legacy`,
3. ewaluację `RTZ v1.1 validated`,
4. heurystyczny search `RTZ v2.0 redesign`,
5. ablation study,
6. krzywą uczenia `T_learn` vs poprawa metryk,
7. panel rekomendacji następnego eksperymentu,
8. eksport wyników do CSV, LaTeX, JSON i notatek do artykułu.

Po zakończeniu runu aplikacja pokazuje sekcję `Następny eksperyment`: interpretuje M1-M5, stabilność wyników i krzywą uczenia, a następnie proponuje kolejny zestaw parametrów. Każda rekomendacja ma jawne diagnozy, tekstowe uzasadnienie oraz listę zmian `parametr: poprzednio -> teraz`. Jeżeli parametry zostają bez zmian, kolejny run jest traktowany jako przebieg stabilizacyjny na nowych seedach. Przycisk `Zastosuj rekomendowane parametry` aktualizuje suwaki, więc można od razu uruchomić kolejny przebieg.

Sekcja `Historia iteracji` zapisuje ostatnie przebiegi w bieżącej sesji przeglądarki. Przycisk `Start autopilota badawczego` uruchamia serię od aktualnych suwaków bez potrzeby wcześniejszego ręcznego wyniku. Po każdym przebiegu aplikacja sama interpretuje wynik, stosuje rekomendowane parametry, przesuwa seedy i uruchamia kolejny eksperyment. Przycisk `Zastosuj i uruchom` wykonuje rekomendowany kolejny eksperyment od razu po kliknięciu. Slider `Limit autopilota` pozwala wybrać 1-50 rekomendowanych runów; autopilot można zatrzymać przyciskiem `Zatrzymaj autopilot`. Autopilot nie blokuje się po domyślnych 7 rundach: limit można zwiększyć, a przy stabilnych wynikach kolejne przebiegi potwierdzają wynik bez wymuszania sztucznej zmiany parametrów.

Każda rekomendacja przesuwa też `seedBase` i `seedSearch`. Dzięki temu przebieg stabilizacyjny nie jest deterministycznym powtórzeniem identycznej trajektorii, tylko niezależnym oknem losowań przy tych samych albo nowych parametrach.

W bocznym panelu są stałe podpowiedzi:

- `Podpowiedzi parametrów` opisują, kiedy ruszać `T_learn`, `T_eval`, `reps`, `seedBase` / `seedSearch`, `explore/exploit` i autopilota.
- `Matematyka metryk` pokazuje jawne wzory M1-M5, weighted score i fair-aware selection w notacji matematycznej, próg `RR ≥ 0.90`, market-only FI oraz to, że dla EG niższa wartość jest lepsza.

Te same wzory i objaśnienia są dostępne w dymkach pod znakami `?` przy suwakach, kartach metryk i tabeli wyników. Wystarczy najechać kursorem albo ustawić focus klawiaturą na `?`.

Rekomendacja kolejnego runu pokazuje diagnozy:

- `learning-limited` - warto zwiększyć `T_learn`,
- `evaluation-noise-limited` - warto zwiększyć `T_eval` lub `reps`,
- `search-limited` - warto zwiększyć `searchExplore` / `searchExploit`,
- `revenue-constrained` - redesign traci zbyt dużo M1 RR,
- `stable` - kolejny run służy potwierdzeniu stabilności.

## Najbliższy cel rozwojowy

Najpierw należy ustabilizować bazę badawczą:

- uruchomić aplikację lokalnie,
- wykonać pełny rerun symulacji,
- zapisać wyniki w `data/results/`,
- sprawdzić krzywą uczenia i ocenić, czy dodatkowe rundy poprawiają selection score oraz M1-M5,
- zaktualizować `art-draft.md`, żeby konsekwentnie opisywał realną implementację jako `validated fairness-aware simulator`, `heuristic mechanism search` i `heterogeneous adaptive agents`.

Szczegóły są w `docs/PROJECT_ANALYSIS.md` i `docs/DEVELOPMENT_PLAN.md`.
