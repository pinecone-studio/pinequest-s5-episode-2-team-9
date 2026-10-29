# Fine-tuning the Hologemma guide

The assembly guide and the "Ask Hologemma" box are answered by our own fine-tuned **Gemma**. It knows
where every part of the heart and the computer attaches, what flows through it (blood, power or data),
what can go wrong with it, and which cable plugs into which socket, in English and Mongolian.

What the student sees, and where it comes from:

| On screen | Source |
|---|---|
| Ring on the opening/socket, "attaches here" label, the carry line, the flow pulse | Measured by `scripts/build-heart.ts` / `scripts/build-computer.ts` into the GLB (`connections`) — no AI, always works |
| Guide card text for each step | `<model>.link.<part>` in `src/i18n` — no AI, always works |
| Answers to "where exactly / why not yet / what flows through it" while assembling, and questions in Study | `/api/ask` → the fine-tuned Gemma endpoint, or Claude Haiku until it is deployed |

```
api/_lib/tutor/knowledge.ts   facts we wrote (connections, diseases, ports)   ─┐
src/i18n/*.json → cards.ts    the study-card texts (EN + MN)                  ─┼→ prompt.ts: systemPrompt(…, assembling)
                                                                               │      │
scripts/build-tutor-dataset.ts  Claude writes explore + assembly-guide Q&A ◄───┘      │ same prompt
training/hologemma-tutor.ipynb  QLoRA fine-tune of Gemma on Kaggle                     │ at runtime
Hugging Face Inference Endpoint ──────────────────────────────► api/ask.ts ◄───────────┘
```

## 1. Facts (whenever you add or fix knowledge)

- Edit `api/_lib/tutor/knowledge.ts`. Every part needs an entry, and `npm test` checks that.
- If you change part texts in `src/i18n`, run `npx tsx scripts/build-tutor-cards.ts`. The test fails until you do.
- To add a model (e.g. brain): add it to `TUTOR_MODELS`, write its knowledge, add a line to `ROLE` in `prompt.ts`,
  and add suggestion chips in `src/lab/panels/AskTutor.tsx`.

## 2. Dataset (on your laptop, about 15–30 minutes)

Put `ANTHROPIC_API_KEY` in `.env.local` (the account needs credits), then:

```sh
npx tsx --env-file=.env.local scripts/build-tutor-dataset.ts   # --rounds 2: explore questions, then assembly-guide conversations
```

This writes `training/data/train.jsonl`, `eval.jsonl` and `review.md` (about 3,500 examples; if it stops
early, add credits and rerun with `--resume`). **Read `review.md`** (100 random
examples), especially the Mongolian answers and the cable/port facts. Fix wrong facts in `knowledge.ts`, not in
the data, then rebuild.

## 3. Fine-tune on Kaggle (about 1 hour)

1. kaggle.com → *Create → New Dataset*, upload `training/data/` and name it **hologemma-tutor-data**.
2. *Create → New Notebook → File → Import notebook*, then pick `training/hologemma-tutor.ipynb`.
3. Notebook settings:
   - *Accelerator*: **GPU T4 x2**
   - *Internet*: **on**
   - *Add Input*: your dataset
   - *Add-ons → Secrets*: **HF_TOKEN** (a Hugging Face *write* token)
4. On huggingface.co, accept the Gemma licence (google/gemma-3-4b-it) with the same account. In the notebook,
   set `HF_REPO` to `your-username/hologemma-tutor`.
5. *Run all*. The notebook will:
   - train the model
   - compare base and fine-tuned answers on held-out questions
   - push the merged model to your private HF repo
   - save a GGUF backup
6. Download `eval_outputs.jsonl` (and the GGUF, as a demo backup) from the notebook's *Output* tab.

## 4. Before / after numbers (your demo slide)

```sh
npx tsx scripts/judge-tutor-eval.ts ~/Downloads/eval_outputs.jsonl
```

This writes `training/results.md`: for base Gemma vs our model, the share of answers that are fully grounded,
in the right language, and following the rules. It's split by heart/computer and EN/MN.

## 5. Serve it

1. huggingface.co → your `hologemma-tutor` repo → *Deploy → Inference Endpoints*.
   - Hardware: one small GPU (an L4 or A10G is enough for 4B).
   - Container: the default (TGI or vLLM).
   - Scale to zero after 15 minutes, to save credits.
2. Copy the endpoint URL. Then set it, plus an HF token that can call it, in Vercel:
   ```sh
   vercel env add TUTOR_ENDPOINT_URL
   vercel env add TUTOR_ENDPOINT_TOKEN
   ```
3. Deploy. In the lab, open the heart, click a valve and ask "what diseases can affect it?".

**Demo day:** open the lab 5 minutes early and ask one question. A sleeping endpoint takes a minute or two to
wake up (the panel says "The tutor is waking up"). Backup: run the GGUF in Ollama on a laptop.
Write a `Modelfile` containing `FROM ./<the .gguf file>`, run `ollama create hologemma -f Modelfile`, and
expose port 11434 with a tunnel. Then set `TUTOR_ENDPOINT_URL` to the tunnel URL and `TUTOR_ENDPOINT_MODEL=hologemma`.
Ollama serves the same `/v1/chat/completions` API.
