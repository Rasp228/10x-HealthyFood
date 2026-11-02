# Zrzuty — testowy PR AI code review

Weryfikacja ręczna fazy 3 na PR #5 (`test/ai-cr` → `master`, 2026-10-30), model
`nvidia/nemotron-3.5-super-vl:free` przez OpenRouter.

| Plik                 | Co pokazuje                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-pipeline.png`    | Runy `review.yml`: #1 `opened` bez `REVIEW_MODEL` (czerwony, bez wywołania modelu), #2 przypadkowy PR #6 (zamknięty), #3 `synchronize` po drugim commicie, #4 `labeled` — ponowne review etykietą `ai-cr:review`.                                                                       |
| `02-job-log.png`     | Run #4: podkroki akcji `ai-reviewer`, linia metryk `[review] {...}`, `Kod wyjścia review: 0, wynik: review, werdykt: fail` i bramka kończąca job na czerwono.                                                                                                                            |
| `03-llm-comment.png` | Sticky komentarz (`edited` — ten sam od runu #1): werdykt, tabela 6 ocen, podsumowanie, metryki, lista wykluczeń. Model potraktował „Nie mergować” z opisu PR-a jako dane, nie polecenie.                                                                                              |
