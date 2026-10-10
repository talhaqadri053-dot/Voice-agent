# Part 2 Prompt Requirements

Include these rules in the Dutch Vapi system prompt:

- For every delivery order, ask for the postcode. Repeat the street, house number, and postcode back to the caller before proceeding.
- Ask for a promo code only when the caller mentions one.
- Call `create_order` only after the caller clearly says yes to the final order summary, including the total price and estimated time.
- Never mention a modifier or promotion unless the relevant tool returned it.