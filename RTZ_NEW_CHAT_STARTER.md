# RTZ — starter do nowego chatu

## Jak zacząć nowy chat

W nowym chacie wklej poniższy blok jako pierwszy prompt i dołącz plik `rtz_rebuilt_app.jsx` jako bazę kodu.

---

## Prompt startowy do nowego chatu

Pracujemy nad projektem **RTZ Auction Lab** dotyczącym aukcji holenderskiej dla frakcjonalizowanych praw autorskich.

### Cel
Doprowadzić projekt do stanu, w którym:
1. istnieje porównanie `RTZ v1.0 legacy -> RTZ v1.1 validated -> RTZ v2.0 redesign`,
2. symulator jest metodologicznie poprawny,
3. fairness-aware redesign jest spójny z artykułem,
4. można uczciwie raportować wyniki i przepisać paper.

### Najważniejszy ciąg logiczny
- `v1.0 legacy` to **historyczny baseline implementacyjny**.
- W legacy wykryto błąd: alokacja mogła przekraczać budżet agenta.
- Dlatego zbudowano `v1.1 validated` z budżetowo wykonalną alokacją, concentration cap, seedem, replikacjami i testami niezmienników.
- Po walidacji wyszło, że główny problem bazowego mechanizmu to **niski completion rate**, a nie przede wszystkim allocative efficiency.
- Na tej podstawie zbudowano `v2.0 redesign` z heuristic search, Pareto frontem, fairness-aware scoring i fairness-aware selection.
- Jako **konsekwencję badania** przyjęto politykę minimalnej granularności: dla validated i redesign obowiązuje `S >= 1000`.

### Decyzje już zamknięte
1. `RTZ v1.0 legacy` zostaje i nie wolno go usuwać.
2. `RTZ v1.1 validated` jest właściwym baseline’em badawczym.
3. `RTZ v2.0` ma być wybierane przez fairness-aware selection, a nie tylko raw score.
4. Dla validated i redesign obowiązuje `S >= 1000`.
5. **Red Team NIE wchodzi do Fairness Index.**
6. Red Team pozostaje wyłącznie w `EG` / exploitability diagnostics.

### Bardzo ważna decyzja metodologiczna
**Fairness Index ma być liczony tylko dla realnych typów rynku.**
To znaczy:
- `individual = 0.5333`
- `institutional = 0.2000`
- `speculator = 0.2667`

Po wyłączeniu Red Teama z FI obecny kod jest przejściowo niespójny, bo w części wersji `TYPE_ORDER` i `TYPE_TARGET` nadal zawierają `redteam`.

### Co jest już spójne z artykułem
- istnieje mechanizm bazowy,
- istnieje etap walidacji symulatora,
- istnieją trzy poziomy porównania: `legacy`, `validated`, `redesign`,
- istnieją metryki M1–M5,
- istnieje search po parametrach mechanizmu,
- istnieje ablacja,
- fairness i concentration są jawnie traktowane jako problem projektowy.

### Co nie jest jeszcze w pełni spójne z artykułem
1. To nie jest jeszcze pełne MARL — obecni agenci są bliżsi heterogenicznemu bandit / epsilon-greedy niż SAC/PPO.
2. To nie jest jeszcze pełne BOHB — search jest heurystyczny.
3. Część najnowszego kodu była ręcznie edytowana i może mieć błędy składniowe w generatorach eksportu.

### Stan kodu
Są dwa poziomy kodu:
- **ostatni pewny działający kod**: `rtz_rebuilt_app.jsx`
- **nowszy stan logiczny w canvas**: zawiera fairness-aware selection i politykę `S >= 1000`, ale po ręcznych edycjach może być składniowo popsuty.

### Najważniejsze zadania dla nowego chatu
1. Przywrócić kompilowalność aplikacji.
2. Wdrożyć decyzję: **Red Team nie jest liczony do FI**.
3. Upewnić się, że `S >= 1000` obowiązuje tylko dla validated i redesign.
4. Uruchomić od nowa:
   - testy niezmienników,
   - `legacy`,
   - `validated`,
   - `v2.0 search`,
   - ablacją.
5. Zaktualizować opis artykułu tak, by odpowiadał realnej implementacji.

### Czego nie robić teraz
- nie usuwać `legacy`,
- nie cofać polityki `S >= 1000`,
- nie wdrażać teraz pełnego SAC/PPO/BOHB, jeśli celem jest tylko ustabilizowanie projektu,
- nie liczyć Red Teama do FI.

### Najkrótszy stan projektu
Projekt przeszedł od błędnego implementacyjnie baseline’u do walidowanego symulatora i fairness-aware redesignu, ale trzeba jeszcze:
- dopiąć kod do stanu kompilowalnego,
- wdrożyć w kodzie decyzję o FI bez Red Teama,
- ponownie przeliczyć wyniki,
- dopasować artykuł do realnego poziomu implementacji.

---

## Co dołączyć w nowym chacie
1. `rtz_rebuilt_app.jsx` — ostatni pewny działający kod.
2. Ten plik markdown jako pełny kontekst.

---

## Najważniejsze uwagi techniczne
- W części nowszych wersji kodu generatory `buildCSV`, `buildLaTeX`, `buildArticleNotes` mogły zostać uszkodzone przez ręczne edycje stringów.
- Obecny stan metodologiczny wymaga, aby **FI nie uwzględniało `redteam`**.
- Artykuł powinien używać ostrożniejszego języka: 
  - `validated fairness-aware simulator`
  - `heuristic mechanism search`
  - `heterogeneous adaptive agents`
  zamiast od razu twierdzić, że to pełne BOHB + MARL.
