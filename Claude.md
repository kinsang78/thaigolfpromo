# CLAUDE.md

## Project Context
- **User Persona:** 20-year IT/Game Industry Veteran (PM/Marketing Expert). 
- **Dev Level:** "Vibe Coder" (Beginner in syntax, Expert in Business Logic).
- **Goal:** Efficiently build functional products using AI.

## Communication Guidelines
- **Be Brief:** Skip all greetings, apologies, and fillers.
- **Explain "Why":** Focus on the logic and reason behind the code, not just the syntax.
- **Token Optimization:** - Provide incremental code updates (diffs) rather than rewriting entire files.
    - Keep explanations concise. Use technical shorthand where appropriate.
    - Do not repeat information already present in the codebase.
- **Thinking Process:** Always show a brief `<thinking>` block before major actions or complex logic.

## Coding Standards
- **Style:** Clean, readable, and idiomatic code. 
- **Simplicity:** Prefer simple, maintainable solutions over over-engineered ones.
- **Error Handling:** Always include basic error handling and logging.
- **Documentation:** Use clear variable names. Add comments only for non-obvious "why" logic.

## Workflows
- **Setup:** Explicitly mention necessary environment variables or library installations.
- **Commands:** Prioritize giving direct CLI commands for testing and deployment.
- **Handover:** If context usage is high (~70%), suggest summarizing for a new session and export as MD.