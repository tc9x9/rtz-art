# Zgodność metodologii i implementacji

## Co można obecnie twierdzić

Bezpieczne sformułowania dla obecnego kodu:

- validated fairness-aware simulator,
- heuristic mechanism search,
- heterogeneous adaptive agents,
- bandit-style learning,
- simulation-in-the-loop redesign,
- market-only Fairness Index,
- Red Team as exploitability diagnostic.

## Czego nie należy jeszcze twierdzić jako wynik implementacji

Do czasu osobnego wdrożenia i walidacji nie należy opisywać obecnej aplikacji jako:

- pełnego MARL,
- pełnego SAC/PPO,
- pełnego BOHB,
- produkcyjnego systemu optymalizacji mechanizmów,
- formalnie skalibrowanego modelu empirycznego rynku.

Takie pojęcia mogą zostać w artykule jako plan rozszerzenia albo kontekst literaturowy, ale nie jako opis wykonanego eksperymentu.

## Fairness Index

Obecna decyzja:

- FI liczy tylko realne typy rynku: `individual`, `institutional`, `speculator`.
- Red Team nie reprezentuje realnego segmentu inwestorów.
- Red Team pozostaje w `EG`, bo jego zadaniem jest wykrywanie exploitability.

Docelowe udziały FI:

- `individual`: 0.5333,
- `institutional`: 0.2000,
- `speculator`: 0.2667.

## Granularność

Obecna decyzja:

- legacy pozostaje historycznym baseline'em i może mieć `S = 100`,
- validated i redesign wymuszają `S >= 1000`,
- search i ablation nie powinny wracać do niskiej granularności.

## Raportowanie wyników

Rekomendowany układ wyników:

1. Pokazać `v1.0 legacy` jako punkt historyczny i uzasadnienie walidacji.
2. Pokazać `v1.1 validated` jako właściwy baseline badawczy.
3. Raportować poprawę `v2.0 redesign` względem `v1.1 validated`.
4. Oddzielić raw weighted score od fairness-aware selection score.
5. Do tabeli dodać informację, że FI jest market-only.
6. Do opisu selection dodać barierę `RR >= 0.90`; konfiguracje poniżej tego progu traktować jako niedopuszczalne dla finalnego fairness-preferred redesignu.
7. Krzywą uczenia raportować jako analizę wrażliwości `T_learn`, nie jako dowód pełnego MARL.
8. Panel rekomendacji traktować jako heurystyczny operator eksperymentalny, a nie niezależny algorytm optymalizacji.
9. Autopilot raportować jako human-in-the-loop batching rekomendowanych eksperymentów, z limitem ustawianym przez użytkownika.
