#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Corrige o build do fork god_of_war_browser após alterações em god_of_war_browser.go.

O script faz 3 ajustes:
1) Remove o parseCheck duplicado de god_of_war_browser.go, mantendo parsecheck.go.
2) Troca setupPSARCDriver para usar vfs.NewDirectoryDriverFile, não *os.File.
3) Troca setupISODriver para usar vfs.NewDirectoryDriverFile, não *os.File.

Uso, na raiz do repositório:
    python fix_gow_browser_build.py

Depois:
    gofmt -w god_of_war_browser.go
    go test ./...
"""

from __future__ import annotations

from pathlib import Path
import re
import sys


TARGET = Path("god_of_war_browser.go")


def find_func_span(src: str, func_name: str) -> tuple[int, int] | None:
    """
    Retorna o span [start:end] da função Go chamada func_name.
    Funciona mesmo se o arquivo estiver minificado em uma linha.
    """
    m = re.search(r"\bfunc\s+" + re.escape(func_name) + r"\s*\(", src)
    if not m:
        return None

    start = m.start()
    brace = src.find("{", m.end())
    if brace < 0:
        raise RuntimeError(f"Função {func_name} encontrada, mas sem '{{'.")

    depth = 0
    i = brace
    in_string = False
    string_quote = ""
    escape = False
    in_line_comment = False
    in_block_comment = False

    while i < len(src):
        ch = src[i]
        nxt = src[i + 1] if i + 1 < len(src) else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if in_string:
            if escape:
                escape = False
            elif ch == "\\" and string_quote != "`":
                escape = True
            elif ch == string_quote:
                in_string = False
                string_quote = ""
            i += 1
            continue

        if ch == "/" and nxt == "/":
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            in_block_comment = True
            i += 2
            continue

        if ch in ('"', "'", "`"):
            in_string = True
            string_quote = ch
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1

        i += 1

    raise RuntimeError(f"Não encontrei o fim da função {func_name}.")


def replace_func(src: str, func_name: str, replacement: str) -> str:
    span = find_func_span(src, func_name)
    if span is None:
        raise RuntimeError(f"Função {func_name} não encontrada.")
    a, b = span
    return src[:a].rstrip() + "\n\n" + replacement.strip() + "\n\n" + src[b:].lstrip()


def remove_func(src: str, func_name: str) -> str:
    span = find_func_span(src, func_name)
    if span is None:
        return src
    a, b = span
    return src[:a].rstrip() + "\n\n" + src[b:].lstrip()


SETUP_PSARC = """
func setupPSARCDriver(path string) (io.Closer, vfs.Directory, error) {
	f := vfs.NewDirectoryDriverFile(path)
	if err := f.Open(true); err != nil {
		return nil, nil, fmt.Errorf("error opening PSARC: %v", err)
	}

	drv, err := psarc.NewPsarcDriver(f)
	if err != nil {
		f.Close()
		return nil, nil, err
	}

	return f, drv, nil
}
"""

SETUP_ISO = """
func setupISODriver(path string) (io.Closer, vfs.Directory, vfs.Directory, error) {
	f := vfs.NewDirectoryDriverFile(path)

	if err := f.Open(false); err != nil {
		log.Printf("Warning: Couldn't open ISO in RW mode, trying RO mode")

		f = vfs.NewDirectoryDriverFile(path)
		if err := f.Open(true); err != nil {
			return nil, nil, nil, fmt.Errorf("error opening ISO: %v", err)
		}
	}

	driverDir, err := iso.NewIsoDriver(f)
	if err != nil {
		f.Close()
		return nil, nil, nil, err
	}

	gameDir, err := toc.NewTableOfContent(driverDir)
	if err != nil {
		f.Close()
		return nil, nil, nil, err
	}

	return f, driverDir, gameDir, nil
}
"""


def main() -> int:
    if not TARGET.exists():
        print(f"ERRO: {TARGET} não encontrado. Execute este script na raiz do repo.", file=sys.stderr)
        return 1

    src = TARGET.read_text(encoding="utf-8")

    backup = TARGET.with_suffix(".go.bak")
    if not backup.exists():
        backup.write_text(src, encoding="utf-8")
        print(f"Backup criado: {backup}")

    # 1) Remover parseCheck duplicado do main file.
    src = remove_func(src, "parseCheck")

    # 2/3) Corrigir setup de PSARC/ISO.
    src = replace_func(src, "setupPSARCDriver", SETUP_PSARC)
    src = replace_func(src, "setupISODriver", SETUP_ISO)

    TARGET.write_text(src, encoding="utf-8")
    print("OK: god_of_war_browser.go corrigido.")
    print("Agora rode:")
    print("  gofmt -w god_of_war_browser.go")
    print("  go test ./...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
