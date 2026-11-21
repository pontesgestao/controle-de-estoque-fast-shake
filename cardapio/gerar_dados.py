"""Gera cardapio/dados.js a partir da planilha de produtos exportada do PDV.

Uso: python3 cardapio/gerar_dados.py caminho/da/planilha.xlsx

A planilha precisa das colunas: Nome, Preço, Categoria (grupo), Código.
Grupos internos (matéria-prima, limpeza, taxas, inativos, iFood) ficam fora.
"""
import json
import re
import sys

import openpyxl

# Grupo do PDV -> (categoria no cardápio, ordem, opções do item)
GRUPOS = {
    'Milk Shake': ('Milk Shake', 1, 'milkshake'),
    'Açaí': ('Açaí', 2, 'acai'),
    'Sundae': ('Sundae', 3, 'sundae'),
    'CASQUINHA E CASCAO': ('Casquinha e Cascão', 4, None),
    'SKIOBA FRUTA E LEITE': ('Picolés de Fruta e ao Leite', 5, None),
    'SKIOBA ESPECIAL': ('Picolés Skioba Especiais', 6, None),
    'SKIOBA EXTRUSADO': ('Picolés Skioba Especiais', 6, None),
    'Gebon': ('Picolés Gebon', 7, None),
    'Savio': ('Picolés Sávio', 8, None),
    'POTINHOS 250ML': ('Potinhos 250 ml', 9, None),
    'Sorvetes Grego Pote 1L': ('Potes de 1 litro', 10, None),
    'Sorvetes Pote 1L': ('Potes de 1 litro', 10, None),
    'Sorvetes Pote 1,5L': ('Potes de 1,5 litro', 11, None),
    'Sorvetes Pote 1,8L': ('Potes de 1,8 litro', 12, None),
    'Sorvetes Pote 2L': ('Potes de 2 litros', 13, None),
    'Bebidas': ('Bebidas', 14, None),
    'BALCAO': ('Balcão', 15, None),
}

# Códigos que ficam fora mesmo estando num grupo do cardápio.
FORA = {
    '454',          # Cascão Copo 180ml (sem preço)
    '513', '391',   # Halls cereja e Ruffles duplicados no PDV
    '455', '456',   # "COOKIE" sem sabor: aguardando os nomes
}

# Promoções de picolé: entram numa categoria própria, no topo.
PROMOCOES = {'440': 'Promo 10 picolés por R$ 18', '442': 'Promo 20 picolés por R$ 30'}

# Itens com opções diferentes das do grupo.
OPCOES_POR_CODIGO = {'360': 'cascao', '361': 'cascao'}

# Acentos e grafias que o PDV não traz.
GRAFIAS = {'Alema': 'Alemã', 'Suiço': 'Suíço', 'Unicornio': 'Unicórnio', 'Tutti-Blue': 'Tutti-blue'}

# Nomes corrigidos à mão (o PDV corta nomes longos e tem erros de digitação).
NOMES = {
    '224': 'Skioba 2 Amores', '11': 'Sávio Coco e Abacaxi ao Leite', '309': 'Skioba Morango com Leite Condensado',
    '310': 'Skioba Napolitano Especial', '311': 'Skioba Passas ao Rum', '308': 'Skioba Abacaxi com Coco',
    '23': 'Skioba Grego Frutas Amarelas', '22': 'Skioba Grego Frutas Vermelhas', '24': 'Skioba Grego Flocos',
    '52': 'Sorvete 1 litro (sabor a combinar)', '302': 'Sávio Brigadeiro', '8': 'Sávio Casadinho',
    '18': 'Sávio Napolitano com Flocos', '303': 'Sávio Caramelo Crocante', '304': 'Sávio Choco Maltine',
    '305': 'Sávio Floresta Negra', '306': 'Sávio Iogurte Grego', '307': 'Sávio Leitinho Trufado',
    '19': 'Sávio Passas ao Rum', '21': 'Sávio Sabor Crocante',
    '409': 'Leite Condensado ao Leite', '418': 'Maçã Verde', '417': 'Maracujá', '502': 'Misturadin Morango e Leite Condensado',
    '501': 'Misturadin Casadinho', '334': 'Tutti-blue', '322': 'Torta de Limão', '324': 'Maracujá com Chocolate',
    '547': 'Maracujá Extrusado', '256': 'Gebon Brigadeiro', '283': 'Gmax Iogurte com Amarena',
    '295': 'Açaí com Creme de Cupuaçu', '296': 'Açaí com Leitinho', '297': 'Hit Açaí com Chocolate Branco',
    '287': 'Leitinho Trufado', '405': 'Cobertura Algodão Doce (mini)', '403': 'Cobertura Caramelo (mini)',
    '406': 'Cobertura Chiclete (mini)', '404': 'Cobertura Chocolate (mini)', '516': 'Cobertura Leite Condensado (mini)',
    '402': 'Cobertura Morango (mini)', '446': 'Trident Hortelã', '445': 'Trident Tutti-frutti',
    '396': 'Ruffles', '392': 'Cheetos (azul)', '397': 'Cheetos (laranja)', '449': 'Doce de Leitinho',
    '555': 'Heineken lata', '62': 'Monster', '564': 'Monster Zero', '359': 'Casquinha', '362': 'Casquinha Trufada',
    '363': 'Casquinha de Açaí', '360': 'Cascão', '361': 'Cascão Trufado',
}

# Subgrupos do Balcão, para o cardápio ficar organizado.
BALCAO = [
    ('Salgadinhos', ('CHEETOS', 'DORITOS', 'FANDANGOS', 'RUFFLES', 'RUFLES')),
    ('Coberturas para levar', ('COBERTURA',)),
    ('Casquinhas para levar', ('PACOTE',)),
]

PEQUENAS = {'de', 'do', 'da', 'dos', 'das', 'e', 'com', 'ao', 'a', 'o', 'em'}


def titulo(texto):
    palavras = texto.lower().split()
    return ' '.join(p if (i and p in PEQUENAS) else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def limpar(nome, grupo):
    n = nome.strip()
    if n.isupper() or n == n.upper():
        n = titulo(n)
    if grupo.startswith('Sorvetes'):
        n = re.sub(r'^Sorvete\s+', '', n, flags=re.I)
        n = re.sub(r'\s*(pote|pot|po)?\s*\d+([,.]\d+)?\s*(l|lts|litros?)\b.*$', '', n, flags=re.I)
        n = re.sub(r'\s+(pote|pot|po)$', '', n, flags=re.I)
    if grupo.startswith(('SKIOBA', 'Savio')) or grupo == 'SKIOBA FRUTA E LEITE':
        n = re.sub(r'^Picol[ée]\s+', '', n, flags=re.I)
        n = re.sub(r'^(Skioba|Sorvete Skioba)\s+', '', n, flags=re.I)
    if grupo == 'POTINHOS 250ML':
        n = re.sub(r'^Potinho 250ml\s+', '', n, flags=re.I)
    if grupo.startswith(('SKIOBA', 'Savio', 'Gebon', 'POTINHOS')):
        n = titulo(n)
    n = n.replace('Maracuja ', 'Maracujá ').replace('Picole ', 'Picolé ')
    for errado, certo in GRAFIAS.items():
        n = re.sub(r'\b' + errado + r'\b', certo, n)
    return n[:1].upper() + n[1:]


def main(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb.worksheets[0]
    itens = []
    for nome, preco, grupo, codigo in ws.iter_rows(min_row=2, max_col=4, values_only=True):
        if not nome or grupo not in GRUPOS:
            continue
        codigo = str(codigo).strip()
        if codigo in PROMOCOES:
            itens.append({'codigo': codigo, 'nome': PROMOCOES[codigo], 'preco': round(float(preco), 2),
                          'categoria': 'Promoções', 'ordem': 0, 'opcoes': 'promo'})
            continue
        if codigo in FORA or not preco:
            continue
        categoria, ordem, opcoes = GRUPOS[grupo]
        opcoes = OPCOES_POR_CODIGO.get(codigo, opcoes)
        if grupo == 'BALCAO':
            categoria = 'Doces e balas'
            for sub, prefixos in BALCAO:
                if str(nome).upper().startswith(prefixos):
                    categoria = sub
            ordem = 15 + [b[0] for b in BALCAO].index(categoria) + 1 if categoria != 'Doces e balas' else 15
        itens.append({
            'codigo': codigo,
            'nome': NOMES.get(codigo) or limpar(str(nome), grupo),
            'preco': round(float(preco), 2),
            'categoria': categoria,
            'ordem': ordem,
            **({'opcoes': opcoes} if opcoes else {}),
        })
    itens.sort(key=lambda i: (i['ordem'], i['preco'] if i['ordem'] <= 4 else 0, i['nome']))
    for i in itens:
        del i['ordem']
    with open('cardapio/dados.js', 'w', encoding='utf-8') as f:
        f.write('// Gerado por cardapio/gerar_dados.py a partir da planilha do PDV. Não edite à mão.\n')
        f.write('window.CARDAPIO_ITENS = ')
        json.dump(itens, f, ensure_ascii=False, indent=1)
        f.write(';\n')
    print(len(itens), 'itens')


if __name__ == '__main__':
    main(sys.argv[1])
