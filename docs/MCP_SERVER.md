# RTZ MCP Server

Repo zawiera lokalny MCP server do bezpiecznej manipulacji domyślnymi parametrami eksperymentu przez klienta AI.

## Uruchomienie

```bash
npm run mcp:params
```

Serwer działa przez stdio i zapisuje konfigurację do:

```text
config/experiment-defaults.json
```

Aplikacja Next ładuje ten plik jako domyślne wartości sliderów i seedów. W trybie `npm run dev` zmiany w JSON zwykle wymagają odświeżenia strony. W buildzie produkcyjnym po zmianach trzeba wykonać ponownie `npm run build`.

## Konfiguracja klienta MCP

Repo zawiera przykładowy plik:

```text
.mcp.json
```

Definiuje server `rtz-params`:

```json
{
  "mcpServers": {
    "rtz-params": {
      "command": "node",
      "args": ["/Users/tc/projects/rtz-art/mcp/rtz-params-server.mjs"]
    }
  }
}
```

Jeżeli repo zostanie przeniesione, zaktualizuj ścieżkę w `args`.

## Dostępne narzędzia

- `get_experiment_params` - zwraca aktualne parametry i szacowaną liczbę ewaluacji.
- `set_experiment_params` - walidowany patch parametrów.
- `reset_experiment_params` - reset do bazowych wartości balanced.
- `apply_experiment_preset` - preset `quick`, `balanced` albo `deep`.
- `get_experiment_param_schema` - zakresy, kroki i definicje presetów.

## Parametry

| Parametr | Zakres | Krok | Znaczenie |
| --- | ---: | ---: | --- |
| `nAgents` | 10-60 | 5 | liczba agentów |
| `tv` | 10000-200000 | 10000 | wartość katalogu w PLN |
| `roundsLearn` | 40-250 | 20 | rundy uczenia |
| `roundsEval` | 20-140 | 10 | rundy ewaluacji |
| `reps` | 3-9 | 1 | repetycje / seedy |
| `searchExplore` | 6-18 | 1 | losowe kandydatury redesignu |
| `searchExploit` | 8-24 | 1 | mutacje elit redesignu |
| `searchBayes` | 0-18 | 1 | kandydaci Bayesian-lite/TPE po explore/exploit |
| `seedBase` | 0-2147483647 | 1 | bazowy seed ewaluacji |
| `seedSearch` | 0-2147483647 | 1 | seed searchu |

## Przykładowe użycie narzędzia

Patch przez MCP powinien mieć kształt:

```json
{
  "params": {
    "roundsLearn": 160,
    "roundsEval": 80,
    "reps": 5
  }
}
```

Preset:

```json
{
  "preset": "quick"
}
```

Serwer odrzuca wartości poza zakresem lub poza krokiem slidera, np. `roundsLearn: 41`.
