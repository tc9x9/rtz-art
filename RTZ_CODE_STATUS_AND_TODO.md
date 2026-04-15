# RTZ — status kodu i TODO

## Co jest stabilne
- `RTZ_STABLE_CODE_BASE.jsx` to ostatni pewny działający kod.
- Zawiera strukturę `legacy -> validated -> redesign`.
- Zawiera poprawny silnik validated z budget-feasible allocation.
- Zawiera testy niezmienników, repetycje i seedowany RNG.

## Co jest logicznie nowsze, ale niepewne
Nowszy stan canvas zawierał dodatkowo:
- fairness-aware scoring,
- fairness-aware selection,
- politykę `S >= 1000`,
- bardziej rozbudowane notatki do artykułu.

Obecna wersja dodaje twardą barierę revenue dla fairness-preferred selection: `RR >= 0.90`.
Dodana jest też krzywa uczenia `T_learn`, która porównuje validated i finalny v2.0 dla różnych długości fazy uczenia.

Ale ten stan mógł być składniowo uszkodzony po ręcznych edycjach.

## Najważniejsza otwarta niespójność
Zapadła decyzja metodologiczna:
**Red Team NIE wchodzi do Fairness Index.**

To oznacza, że w kodzie trzeba docelowo:
- usunąć `redteam` z `TYPE_ORDER` używanego przez FI,
- zmienić `TYPE_TARGET` na:
  - `individual: 0.5333`
  - `institutional: 0.2000`
  - `speculator: 0.2667`
- zostawić Red Team tylko w `EG`.

## Rekomendowana kolejność prac
1. Odtworzyć stabilny kod na bazie `RTZ_STABLE_CODE_BASE.jsx`.
2. Dodać politykę `S >= 1000` dla validated i redesign.
3. Dodać fairness-aware scoring i selection.
4. Wdrożyć decyzję: Red Team poza FI.
5. Utrzymać barierę `RR >= 0.90` przy wyborze finalnego v2.0.
6. Analizować krzywą uczenia przed opisaniem wpływu adaptacji agentów.
7. Naprawić eksport CSV/LaTeX/notes.
8. Uruchomić pełny rerun.
