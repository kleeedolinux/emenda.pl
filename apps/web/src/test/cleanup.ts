// Carregado depois de `dom.ts` (o `screen` do Testing Library exige `document` na importação).
import { cleanup } from "@testing-library/react";
import { afterEach } from "bun:test";

afterEach(cleanup);
