"""Builds the Mazcina kitchen data pack from the transcribed manual and the two invoices.

Every mapping decision is in this file so it can be reviewed. Nothing is invented:
- quantities come from the manual (ranges -> midpoint, flagged approx);
- prices come from invoice lines, as charged;
- where the manual gives no amount, the item is listed as "cantidad necesaria", not costed;
- yields the manual does not state are estimated from the ingredient weights and flagged.
"""
import json, re, sys
from collections import OrderedDict

# Usage: python3 build_pack.py <folder with extract-*.json> <output.json>
HERE = sys.argv[1]
OUT = sys.argv[2]
R = sum([json.load(open(f'{HERE}/extract-{x}.json')) for x in 'ABC'], [])
NOTES = json.load(open(f'{HERE}/extract-notes.json'))

MANUAL = 'manual-recetas-2026-08'
SOURCES = [
    {'key': MANUAL, 'kind': 'recipe-manual', 'title': 'Manual de Recetas de Cocina Mazcina, versión de trabajo agosto 2026 (54 páginas)', 'date': '2026-08-01', 'reference': 'Manual_de_Recetas_Mazcina.pdf, sent by Nacha 2026-10-15'},
    {'key': 'bidfood-i71906625', 'kind': 'invoice', 'title': 'Bidfood Botany tax invoice I71906625.BOT', 'date': '2026-10-15', 'supplier': 'Bidfood', 'reference': 'goods prices from bidfood.pdf'},
    {'key': 'house-free-items', 'kind': 'note', 'title': 'Items with no purchase cost (tap water)', 'date': '2026-10-16'},
    {'key': 'mickeys-inv-23412', 'kind': 'invoice', 'title': "Mickey's Fruit & Veg tax invoice INV-23412", 'date': '2026-08-31', 'supplier': "Mickey's Fruit & Veg", 'reference': 'veggies prices.pdf'},
]
SUPPLIERS = [
    {'name': 'Bidfood', 'contact': 'Bidfood Botany, 14 McPherson St, Banksmeadow NSW 2019 · (02) 8199 5499 · customer 435720'},
    {'name': "Mickey's Fruit & Veg", 'contact': '86 Pitt St, Redfern NSW 2016 · +61 2 9719 9022'},
    {'name': 'Mazcina (in house)', 'contact': 'Things that cost nothing to buy, such as tap water'},
]

# ---------------------------------------------------------------- ingredients
# canonical English name -> (category, base unit, Spanish name, extra)
ING = OrderedDict()
def ing(name, cat, base, es, **extra):
    ING[name] = dict(name=name, category=cat, baseUnit=base, nameEs=es, **extra)

# Dry goods and baking
ing('Flour, plain', 'Dry goods', 'g', 'Harina')
ing('Semolina', 'Dry goods', 'g', 'Sémola')
ing('Salt', 'Dry goods', 'g', 'Sal')
ing('Salt flakes', 'Dry goods', 'g', 'Salt flakes')
ing('Sugar', 'Dry goods', 'g', 'Azúcar')
ing('Sugar syrup', 'Dry goods', 'ml', 'Syrup de azúcar')
ing('Yeast, dry instant', 'Dry goods', 'g', 'Levadura seca', preferredSupplier='Bidfood')
ing('Baking powder', 'Dry goods', 'g', 'Polvos de hornear')
ing('Rice', 'Dry goods', 'g', 'Arroz')
ing('Vegetable stock powder', 'Dry goods', 'g', 'Caldo de verduras en polvo')
ing('Cornflakes', 'Dry goods', 'g', 'Cornflakes triturados')
ing('Toasted corn (canchita)', 'Dry goods', 'g', 'Canchita')
ing('Cashew nuts', 'Dry goods', 'g', 'Castañas de cajú')
ing('Raisins', 'Dry goods', 'g', 'Pasas')
ing('Pumpkin seeds', 'Dry goods', 'g', 'Semillas de calabaza')
ing('Flour tortillas', 'Dry goods', 'each', 'Tortillas de harina')
ing('Vanilla essence', 'Dry goods', 'ml', 'Esencia de vainilla')
ing("Chocolate sauce (Hershey's)", 'Dry goods', 'ml', "Salsa de chocolate Hershey's")
# Spices
for n, es in [('Garlic powder', 'Ajo en polvo'), ('Onion powder', 'Cebolla en polvo'), ('Smoked paprika', 'Paprika ahumada'),
              ('Sweet paprika', 'Paprika dulce'), ('Cayenne or chilli powder', 'Cayena o chili powder'), ('Ground cumin', 'Comino molido'),
              ('Dried oregano', 'Orégano seco'), ('Dried thyme', 'Tomillo seco'), ('Dried coriander', 'Cilantro seco'),
              ('Coriander seeds', 'Semillas de cilantro'), ('Black pepper, cracked', 'Pimienta negra gruesa'),
              ('Black pepper, ground', 'Pimienta negra molida'), ('Rosemary', 'Romero')]:
    ing(n, 'Spices', 'g', es)
ing('Bay leaves', 'Spices', 'each', 'Laurel')
ing('Saffron', 'Spices', 'each', 'Azafrán (paquete)')
ing('Cinnamon sticks', 'Spices', 'each', 'Canela (rama)')
ing('Cloves', 'Spices', 'each', 'Clavos de olor')
# Oils, vinegars, sauces, condiments
ing('Olive oil', 'Oils & vinegars', 'ml', 'Aceite de oliva')
ing('Canola oil', 'Oils & vinegars', 'ml', 'Aceite de canola / aceite')
ing('Frying oil', 'Oils & vinegars', 'ml', 'Aceite para freír')
ing('Red wine vinegar', 'Oils & vinegars', 'ml', 'Vinagre de vino tinto')
ing('Malt vinegar', 'Oils & vinegars', 'ml', 'Vinagre de malta')
ing('Balsamic vinegar', 'Oils & vinegars', 'ml', 'Vinagre balsámico')
ing('Soy sauce', 'Sauces & condiments', 'ml', 'Salsa de soya regular')
ing('Dark soy sauce', 'Sauces & condiments', 'ml', 'Salsa de soya negra')
ing('Mayonnaise', 'Sauces & condiments', 'g', 'Mayonesa')
ing('Dijon mustard', 'Sauces & condiments', 'g', 'Mostaza Dijon')
ing('Tomato ketchup', 'Sauces & condiments', 'g', 'Ketchup', preferredSupplier='Bidfood')
ing('Tomato paste', 'Sauces & condiments', 'g', 'Concentrado de tomate')
ing('Tomatoes, peeled, canned', 'Sauces & condiments', 'g', 'Tomates enlatados', preferredSupplier='Bidfood')
ing('Red peppers, roasted, canned', 'Sauces & condiments', 'g', 'Pimentones rojos rostizados (enlatados)', preferredSupplier='Bidfood')
ing('Dill pickles', 'Sauces & condiments', 'g', 'Pepinillos dill')
ing('Capers', 'Sauces & condiments', 'g', 'Alcaparras')
ing('Black olives', 'Sauces & condiments', 'g', 'Aceitunas negras')
# Dairy and eggs
ing('Eggs', 'Dairy & eggs', 'each', 'Huevos')
ing('Milk, full cream', 'Dairy & eggs', 'ml', 'Leche (entera)')
ing('Cream', 'Dairy & eggs', 'ml', 'Crema')
ing('Whipped cream (chantilly)', 'Dairy & eggs', 'g', 'Crema chantilly')
ing('Condensed milk, can', 'Dairy & eggs', 'each', 'Leche condensada (lata)')
ing('Evaporated milk', 'Dairy & eggs', 'ml', 'Leche evaporada')
ing('Butter', 'Dairy & eggs', 'g', 'Mantequilla')
ing('Clarified butter', 'Dairy & eggs', 'g', 'Mantequilla clarificada')
ing('Gouda cheese', 'Dairy & eggs', 'g', 'Queso Gouda')
ing('Parmesan', 'Dairy & eggs', 'g', 'Parmesano')
ing('Feta, Danish style', 'Dairy & eggs', 'g', 'Queso feta Danish Style')
ing('Vanilla ice cream', 'Dairy & eggs', 'each', 'Helado de vainilla (scoop)')
ing('Dulce de leche (manjar)', 'Dairy & eggs', 'g', 'Manjar / Dulce de leche')
# Meat
ing('Rump steak', 'Meat', 'g', 'Rump steak')
ing('Roast beef (beef for mechada)', 'Meat', 'g', 'Roast beef')
ing('Chicken breast', 'Meat', 'g', 'Pechuga de pollo / pollo')
ing('Chorizo', 'Meat', 'g', 'Chorizo')
ing('Beef fat, rendered (manteca)', 'Meat', 'g', 'Manteca de Carne (de recortes de grasa)')
# Seafood
# 26/30 = 26 to 30 prawns per pound (454 g): about 16 g each, from the product grade on the invoice.
ing('Prawn meat, raw 26/30', 'Seafood', 'g', 'Camarones pelados y desvenados', gramsPerEach=16, preferredSupplier='Bidfood')
ing('Prawn cutlets, raw 26/30 (tail on)', 'Seafood', 'g', 'Camarón con cola', gramsPerEach=16, preferredSupplier='Bidfood')
ing('Tiger prawns, whole', 'Seafood', 'each', 'Tiger prawns enteros')
ing('Salmon portions, skinless 200 g', 'Seafood', 'g', 'Salmón', preferredSupplier='Bidfood')
ing('Barramundi', 'Seafood', 'g', 'Barramundi')
ing('Crab meat', 'Seafood', 'g', 'Carne de cangrejo limpia')
ing('Mussels, frozen, cleaned', 'Seafood', 'g', 'Choritos congelados limpios')
ing('Fish frames and heads', 'Seafood', 'g', 'Cabezas/espinas/colas de pescado')
ing('Scallop shell (garnish)', 'Seafood', 'each', 'Concha de ostión')
# Fruit and vegetables
ing('Tomatoes, round', 'Fruit & veg', 'g', 'Tomate fresco', preferredSupplier="Mickey's Fruit & Veg")
ing('Cherry tomatoes', 'Fruit & veg', 'g', 'Tomates cherry')
ing('Red onion', 'Fruit & veg', 'g', 'Cebolla roja / morada')
ing('Brown onion', 'Fruit & veg', 'g', 'Cebolla blanca')
ing('Spring onions (shallots)', 'Fruit & veg', 'g', 'Cebollín')
ing('Garlic, peeled', 'Fruit & veg', 'g', 'Ajo pelado / ajo fresco')
ing('Ginger', 'Fruit & veg', 'g', 'Jengibre fresco', preferredSupplier="Mickey's Fruit & Veg")
ing('Red capsicum', 'Fruit & veg', 'g', 'Pimentón rojo', preferredSupplier="Mickey's Fruit & Veg")
ing('Button mushrooms', 'Fruit & veg', 'g', 'Champiñones', preferredSupplier="Mickey's Fruit & Veg")
ing('Rocket', 'Fruit & veg', 'g', 'Rocket', preferredSupplier="Mickey's Fruit & Veg")
ing('Coriander, fresh', 'Fruit & veg', 'g', 'Cilantro fresco')
ing('Parsley, fresh', 'Fruit & veg', 'g', 'Perejil fresco')
ing('Basil, fresh', 'Fruit & veg', 'g', 'Albahaca fresca')
ing('Mint, fresh', 'Fruit & veg', 'each', 'Menta (hoja/ramita)')
ing('Rosemary, fresh', 'Fruit & veg', 'g', 'Romero fresco')
ing('Spinach', 'Fruit & veg', 'g', 'Espinaca fresca')
ing('Avocado', 'Fruit & veg', 'g', 'Palta')
ing('Potatoes', 'Fruit & veg', 'g', 'Papas frescas')
ing('Butternut pumpkin, cooked', 'Fruit & veg', 'g', 'Zapallo camote cocido')
ing('Sweet potato, cooked (piece)', 'Fruit & veg', 'each', 'Camote cocido (trozo)')
ing('Lemon juice', 'Fruit & veg', 'ml', 'Jugo de limón')
ing('Lemon wedge', 'Fruit & veg', 'each', 'Limón (gajo)')
ing('Orange', 'Fruit & veg', 'each', 'Naranja', preferredSupplier="Mickey's Fruit & Veg")
ing('Dehydrated orange slice', 'Fruit & veg', 'each', 'Naranja deshidratada (rodaja)')
ing('Green peas', 'Fruit & veg', 'g', 'Arvejas')
ing('Vegetable trimmings', 'Fruit & veg', 'g', 'Recortes de verduras limpios')
ing('Frozen berries', 'Fruit & veg', 'g', 'Berries congelados', preferredSupplier='Bidfood')
ing('Frozen chips (fries)', 'Fruit & veg', 'g', 'Papas fritas (congeladas)')
# Bakery and drinks
ing('Bread', 'Bakery', 'g', 'Pan')
ing('Baguette slices, toasted', 'Bakery', 'each', 'Tostadas de baguette')
ing('White wine', 'Drinks', 'ml', 'Vino blanco')
ing('Red wine', 'Drinks', 'ml', 'Vino tinto')
ing('Beer', 'Drinks', 'ml', 'Cerveza')
ing('Water', 'Other', 'ml', 'Agua')

# Spanish item text -> ('i', ingredient) or ('r', recipe) ; None = always "as needed"
MAP = {
 'Harina': ('i','Flour, plain'), 'Harina de trigo': ('i','Flour, plain'), 'Sémola': ('i','Semolina'),
 'Sal': ('i','Salt'), 'Salt flakes': ('i','Salt flakes'),
 'Azúcar': ('i','Sugar'), 'Azúcar granulada': ('i','Sugar'), 'Syrup de azúcar': ('i','Sugar syrup'),
 'Levadura seca': ('i','Yeast, dry instant'), 'Polvos de hornear': ('i','Baking powder'), 'Polvo de hornear': ('i','Baking powder'),
 'Arroz': ('i','Rice'), 'Caldo de verduras en polvo': ('i','Vegetable stock powder'), 'Cornflakes triturados': ('i','Cornflakes'),
 'Canchita': ('i','Toasted corn (canchita)'), 'Cashew nuts / castañas de cajú': ('i','Cashew nuts'), 'Pasas': ('i','Raisins'),
 'Semillas de calabaza': ('i','Pumpkin seeds'), 'Tortillas de harina': ('i','Flour tortillas'),
 'Esencia de vainilla': ('i','Vanilla essence'), 'Vainilla para remojo': ('i','Vanilla essence'), "Salsa de chocolate Hershey's": ('i',"Chocolate sauce (Hershey's)"),
 'Ajo en polvo': ('i','Garlic powder'), 'Cebolla en polvo': ('i','Onion powder'), 'Paprika ahumada': ('i','Smoked paprika'),
 'Paprika dulce': ('i','Sweet paprika'), 'Cayena o chili powder': ('i','Cayenne or chilli powder'),
 'Comino molido': ('i','Ground cumin'), 'Comino': ('i','Ground cumin'), 'Orégano seco': ('i','Dried oregano'), 'Orégano': ('i','Dried oregano'),
 'Tomillo seco': ('i','Dried thyme'), 'Cilantro seco': ('i','Dried coriander'), 'Semillas de cilantro': ('i','Coriander seeds'),
 'Pimienta negra gruesa': ('i','Black pepper, cracked'), 'Pimienta negra': ('i','Black pepper, ground'), 'Pimienta negra molida': ('i','Black pepper, ground'),
 'Romero': ('i','Rosemary'), 'Laurel': ('i','Bay leaves'), 'Azafrán': ('i','Saffron'), 'Canela': ('i','Cinnamon sticks'), 'Clavos de olor': ('i','Cloves'),
 'Aceite de oliva': ('i','Olive oil'), 'Aceite de canola': ('i','Canola oil'), 'Aceite de canola para marinar': ('i','Canola oil'),
 'Aceite de canola para wok': ('i','Canola oil'), 'Aceite': ('i','Canola oil'), 'Aceite para freír': ('i','Frying oil'),
 'Vinagre de vino tinto': ('i','Red wine vinegar'), 'Vinagre de malta': ('i','Malt vinegar'), 'Vinagre balsámico': ('i','Balsamic vinegar'),
 'Salsa de soya regular': ('i','Soy sauce'), 'Salsa de soya negra': ('i','Dark soy sauce'), 'Mayonesa': ('i','Mayonnaise'),
 'Mostaza Dijon': ('i','Dijon mustard'), 'Ketchup': ('i','Tomato ketchup'), 'Concentrado de tomate': ('i','Tomato paste'),
 'Tomates enlatados': ('i','Tomatoes, peeled, canned'), 'Pimentones rojos rostizados': ('i','Red peppers, roasted, canned'),
 'Pimentones rojos rostizados enlatados': ('i','Red peppers, roasted, canned'), 'Pepinillos dill': ('i','Dill pickles'),
 'Alcaparras': ('i','Capers'), 'Aceitunas negras': ('i','Black olives'),
 'Huevos': ('i','Eggs'), 'Huevo': ('i','Eggs'), 'Huevos (dora)': ('i','Eggs'), 'Huevos duros': ('i','Eggs'), 'Huevos enteros': ('i','Eggs'),
 'Huevo frito': ('i','Eggs'), 'Yema de huevo': ('i','Eggs'),
 'Leche': ('i','Milk, full cream'), 'Leche (dora)': ('i','Milk, full cream'), 'Leche entera': ('i','Milk, full cream'), 'Crema': ('i','Cream'),
 'Crema chantilly': ('i','Whipped cream (chantilly)'), 'Leche condensada': ('i','Condensed milk, can'), 'Leche condensada en lata': ('i','Condensed milk, can'),
 'Leche evaporada': ('i','Evaporated milk'), 'Mantequilla': ('i','Butter'), 'Mantequilla clarificada': ('i','Clarified butter'),
 'Queso Gouda': ('i','Gouda cheese'), 'Queso Gouda rallado': ('i','Gouda cheese'), 'Queso Gouda derretido': ('i','Gouda cheese'),
 'Parmesano': ('i','Parmesan'), 'Queso parmesano': ('i','Parmesan'), 'Queso feta Danish Style': ('i','Feta, Danish style'),
 'Helado de vainilla': ('i','Vanilla ice cream'), 'Manjar Mazcina': ('i','Dulce de leche (manjar)'),
 'Rump steak': ('i','Rump steak'), 'Rump steak laminado fino': ('i','Rump steak'), 'Roast beef': ('i','Roast beef (beef for mechada)'),
 'Pollo': ('i','Chicken breast'), 'Pechuga de pollo en cubos': ('i','Chicken breast'), 'Chorizo': ('i','Chorizo'),
 'Manteca de Carne Mazcina': ('i','Beef fat, rendered (manteca)'),
 'Camarones congelados': ('i','Prawn meat, raw 26/30'), 'Camarones pelados y desvenados': ('i','Prawn meat, raw 26/30'),
 'Camarones pelados/desvenados': ('i','Prawn meat, raw 26/30'), 'Camarones cocidos picados': ('i','Prawn meat, raw 26/30'),
 'Camarón cocido con cola': ('i','Prawn cutlets, raw 26/30 (tail on)'), 'Tiger prawn': ('i','Tiger prawns, whole'), 'Tiger prawns enteros': ('i','Tiger prawns, whole'),
 'Salmón': ('i','Salmon portions, skinless 200 g'), 'Salmón fresco en cubos': ('i','Salmon portions, skinless 200 g'), 'Barramundi': ('i','Barramundi'),
 'Carne de cangrejo limpia': ('i','Crab meat'), 'Choritos congelados limpios': ('i','Mussels, frozen, cleaned'),
 'Cabezas/espinas/colas de pescado': ('i','Fish frames and heads'), 'Concha de ostión': ('i','Scallop shell (garnish)'),
 'Tomate fresco': ('i','Tomatoes, round'), 'Tomate fresco en láminas': ('i','Tomatoes, round'), 'Tomate en gajos grandes': ('i','Tomatoes, round'),
 'Tomates cherry': ('i','Cherry tomatoes'),
 'Cebolla roja': ('i','Red onion'), 'Cebolla roja en pluma': ('i','Red onion'), 'Cebolla roja en pluma fina': ('i','Red onion'), 'Cebolla roja en gajos': ('i','Red onion'),
 'Cebolla morada y/o blanca': ('i','Red onion'), 'Cebolla blanca o morada': ('i','Brown onion'), 'Cebolla blanca': ('i','Brown onion'), 'Cebolla': ('i','Brown onion'),
 'Cebollín': ('i','Spring onions (shallots)'),
 'Ajo': ('i','Garlic, peeled'), 'Ajo pelado': ('i','Garlic, peeled'), 'Ajo fresco': ('i','Garlic, peeled'), 'Ajo fresco picado': ('i','Garlic, peeled'),
 'Jengibre fresco': ('i','Ginger'), 'Pimentón rojo': ('i','Red capsicum'), 'Pimentón rojo en cubos': ('i','Red capsicum'), 'Pimentón rojo en tiras': ('i','Red capsicum'),
 'Champiñones': ('i','Button mushrooms'), 'Rocket': ('i','Rocket'), 'Cilantro fresco': ('i','Coriander, fresh'),
 'Perejil fresco': ('i','Parsley, fresh'), 'Perejil fresco picado': ('i','Parsley, fresh'), 'Albahaca fresca': ('i','Basil, fresh'),
 'Menta': ('i','Mint, fresh'), 'Menta fresca': ('i','Mint, fresh'), 'Romero fresco': ('i','Rosemary, fresh'), 'Espinaca fresca': ('i','Spinach'),
 'Palta': ('i','Avocado'), 'Palta molida': ('i','Avocado'), 'Palta en cubos': ('i','Avocado'), 'Papas frescas': ('i','Potatoes'),
 'Zapallo camote cocido y escurrido': ('i','Butternut pumpkin, cooked'), 'Camote cocido': ('i','Sweet potato, cooked (piece)'),
 'Jugo de limón': ('i','Lemon juice'), 'Limón': ('i','Lemon wedge'), 'Limón fresco': ('i','Lemon wedge'), 'Naranja': ('i','Orange'), 'Ralladura de naranja': ('i','Orange'),
 'Naranja deshidratada': ('i','Dehydrated orange slice'), 'Arvejas': ('i','Green peas'), 'Arvejas verdes': ('i','Green peas'),
 'Recortes de verduras limpios': ('i','Vegetable trimmings'), 'Berries congelados': ('i','Frozen berries'),
 'Papas fritas': ('i','Frozen chips (fries)'), 'Papas fritas congeladas': ('i','Frozen chips (fries)'),
 'Pan': ('i','Bread'), 'Tostadas de baguette con mantequilla de ajo': ('i','Baguette slices, toasted'),
 'Vino blanco': ('i','White wine'), 'Vino tinto': ('i','Red wine'), 'Cerveza': ('i','Beer'), 'Agua': ('i','Water'), 'Agua tibia': ('i','Water'),
 # preparations
 'Puré de ajo confitado': ('r','Ajo Confitado Mazcina'), 'Aceite aromatizado de Ajo Confitado': ('i','Olive oil'),
 'Mayonesa de Ajo Mazcina': ('r','Mayonesa de Ajo (Alioli) Mazcina'), 'Alioli Mazcina': ('r','Mayonesa de Ajo (Alioli) Mazcina'),
 'Salsa a elección': ('r','Mayonesa de Ajo (Alioli) Mazcina'),
 'Cebolla Encurtida Mazcina': ('r','Cebolla Encurtida Mazcina'), 'Salsa de Tomate Mazcina': ('r','Salsa de Tomate Mazcina'),
 'Confitado de Cherry y Pimentones': ('r','Confitado de Tomates Cherry y Pimentones Mazcina'), 'Salsa Brava Mazcina': ('r','Salsa Brava Mazcina'),
 'Fumet de Pescado Mazcina': ('r','Fumet de Pescado Mazcina'), 'Pesto Mazcina': ('r','Pesto Mazcina'),
 'Jugo de Jengibre Mazcina': ('r','Jugo Concentrado de Jengibre Mazcina'), 'Dressing de Limón': ('r','Dressing de Limón Mazcina'),
 'Dressing de Limón Mazcina': ('r','Dressing de Limón Mazcina'), 'Adobo para Pescado Mazcina': ('r','Adobo para Pescado Mazcina'),
 'Adobo para Pescado': ('r','Adobo para Pescado Mazcina'), 'Batido para Pescado': ('r','Batido para Pescado Mazcina'),
 'Arroz Blanco Mazcina': ('r','Arroz Blanco Mazcina'), 'Homemade Potatoes Mazcina': ('r','Homemade Potatoes Mazcina'),
 'Homemade Potatoes o papas fritas': ('r','Homemade Potatoes Mazcina'), 'Papas Provenzal Mazcina': ('r','Papas Provenzal Mazcina'),
 'Cebolla Estofada Mazcina': ('r','Cebolla Estofada Mazcina'), 'Salsa de Lomo Saltado Mazcina': ('r','Salsa de Lomo Saltado Mazcina'),
 'Tortillas de Harina Fritas': ('r','Tortillas de Harina Fritas Mazcina'), 'Tortillas fritas': ('r','Tortillas de Harina Fritas Mazcina'),
 'Pebre Mazcina': ('r','Pebre Mazcina'), 'Ensalada Chilena Mazcina': ('r','Ensalada Chilena Mazcina'),
 'Mechada Mazcina': ('r','Mechada / Carne a la Cacerola Mazcina'),
 # the manual gives the crumbing per batch but not the chicken weight, so dishes cost the chicken itself
 'Pollo Apanado Mazcina': ('i','Chicken breast'),
 'Pasta Fresca Mazcina congelada': ('r','Pasta Fresca Mazcina'), 'Pan Mazcina grande': ('r','Pan Mazcina'),
 'Salsa Tártara Mazcina': ('r','Salsa Tártara Mazcina'), 'Salsa Tártara': ('r','Salsa Tártara Mazcina'),
 'Crumble Mazcina': ('r','Crumble Mazcina'), 'Panqueque Mazcina': ('r','Panqueques Mazcina'),
 'Pudín de Sémola Mazcina': ('r','Pudín de Sémola Mazcina'), 'Salsa de Berries y Vino Tinto': ('r','Salsa de Berries y Vino Tinto Mazcina'),
 'Salsa adicional': ('r','Salsa de Berries y Vino Tinto Mazcina'),
 # never costable as written
 'Mini Ensalada Mazcina': None, 'Líquido de Mechada': None, 'Harina + sal': None, 'Harina + sémola': None, 'Sal y perejil': None,
 'Agua de cocción del zapallo': None, 'Mantequilla clarificada + aceite de oliva': None, 'Recortes limpios de grasa de vacuno': None,
}

# per-recipe line overrides: (recipe, item, occurrence) -> dict(quantity, unit, note)
OVERRIDE = {
 ('Tortillas de Harina Fritas Mazcina', 'Tortillas de harina'): dict(quantity=1, unit='each', original='cada tortilla se corta en 8'),
 ('Napo Chicken Bites Mazcina', 'Pollo Apanado Mazcina'): dict(quantity=200, unit='g', original='200 g de Pollo Apanado Mazcina: se costea el pollo; el apanado no se costea'),
 ('Kids Crispy Chicken Mazcina', 'Pollo Apanado Mazcina'): dict(quantity=200, unit='g', original='200 g de Pollo Apanado Mazcina: se costea el pollo; el apanado no se costea'),
 # "1 unidad / 150 g": cost the 150 g bun from the batch
 ('Barros Luco Mazcina', 'Pan Mazcina grande'): dict(quantity=150, unit='g', original='1 unidad / 150 g'),
 ('Fish Sandwich Mazcina', 'Pan Mazcina grande'): dict(quantity=150, unit='g', original='1 unidad / 150 g'),
 ('Mechada Italiana Mazcina', 'Pan Mazcina grande'): dict(quantity=150, unit='g', original='1 unidad / 150 g'),
 # "1 receta" of the alioli = its whole yield
 ('Salsa Tártara Mazcina', 'Mayonesa de Ajo Mazcina'): dict(quantity='YIELD', unit='g', original='1 receta (aprox. 1 kg)'),
 # evaporated milk: 2 cans of about 400 ml
 ('Cuatro Leches Mazcina', 'Leche evaporada'): dict(quantity=800, unit='ml', original='2 latas, aprox. 400 ml c/u', approx=True),
 # per-portion lines in an 8-portion batch
 ('Cuatro Leches Mazcina', 'Manjar Mazcina'): dict(quantity=200, unit='g', original='20-30 g por porción × 8 porciones', approx=True),
 ('Cuatro Leches Mazcina', 'Crema chantilly'): dict(quantity=160, unit='g', original='20 ml aprox. por porción × 8 porciones', approx=True),
 ('Celestinos Mazcina', 'Crema chantilly'): dict(quantity=10, unit='g', original='10 g aprox.', approx=True),
 # raisins are per empanada: listed, not costed per batch
 ('Pino de Carne para Empanadas Mazcina', 'Pasas'): 'ASNEEDED',
}

# yields the manual states, as (quantity, unit, estimated)
YIELD = {
 'Pan Mazcina': (1750, 'g', False),
 'Sopaipillas Mazcina': (1600, 'g', False),
 'Masa de Empanadas Mazcina': (37.5, 'each', False),     # 35-40 tapas
 'Panqueques Mazcina': (5.5, 'each', False),             # 5-6 panqueques
 'Crumble Mazcina': (600, 'g', False),
 'Pudín de Sémola Mazcina': (6, 'each', False),          # 6 porciones
 'Papas Provenzal Mazcina': (1, 'each', False),          # 1 porción
 'Ensalada Chilena Mazcina': (1, 'each', False),         # 1 porción
 # worked out from the manual's own numbers (pieces × grams), so flagged as estimates
 'Pino de Carne para Empanadas Mazcina': (56 * 27.5, 'g', True),   # 52-60 × 25-30 g
 'Pino de Camarón y Queso Mazcina': (42.5 * 30, 'g', True),        # 40-45 × 30 g
 'Tortillas de Harina Fritas Mazcina': (8, 'each', False),         # each tortilla cut in 8
}
PORTIONS = {'Cuatro Leches Mazcina': 8, 'Pudín de Sémola Mazcina': 6}
EGG_G = 50  # only used to estimate a batch weight, never to cost an egg

SKIP = {  # manual entries that are not one costable recipe; their content goes to questions/new recipes
 'Manteca de Carne Mazcina', 'Manjar / Dulce de Leche Mazcina', 'Mini Ensalada Mazcina',
 'Empanadas Mazcina - Armado, Formas y Servicio', 'Estándar de Extras para Sándwiches Mazcina', 'Proteínas Adicionales para Ensaladas',
}
DISH_SECTIONS = {'Entradas', 'Platos principales', 'Sándwiches', 'Ensaladas', 'Menú de niños'}
PREP_DISHES_DESSERT = {'Celestinos Mazcina', 'Pudín de Sémola con Berries y Vino Tinto', 'Cuatro Leches Mazcina'}
# preps in dish sections (used inside other dishes)
METHOD_ONLY = {'Pollo Apanado Mazcina'}  # kept as a method card (dish type: no batch yield)
DISH_IS_PREP = {'Ensalada Chilena Mazcina', 'Papas Provenzal Mazcina'}


def recipe_type(r):
    if r['name'] in PREP_DISHES_DESSERT or r['name'] in METHOD_ONLY: return 'dish'
    if r['name'] in DISH_IS_PREP: return 'prep'
    sec = r['section']
    if sec in DISH_SECTIONS: return 'dish'
    return 'prep'


def build():
    by_name = {r['name']: r for r in R}
    recipes = []
    for r in R:
        if r['name'] in SKIP: continue
        rec = OrderedDict(name=r['name'], type=recipe_type(r), section=r['section'], portions=PORTIONS.get(r['name'], 1),
                          source=MANUAL, page=r['page'], use=r['use'] or None, yieldText=r['yieldText'] or None,
                          equipment=r['equipment'], method=r['method'], criticalPoints=r['criticalPoints'],
                          asNeeded=[], pending=list(r.get('pending') or []), lines=[])
        for l in r['lines']:
            item = l['item']
            ov = OVERRIDE.get((r['name'], item))
            target = MAP.get(item, 'MISSING')
            if target == 'MISSING': raise SystemExit(f'unmapped item {item!r} in {r["name"]}')
            if ov == 'ASNEEDED' or target is None or (l['quantity'] is None and not ov):
                rec['asNeeded'].append(f"{item} ({l['quantityText']}{'; ' + l['noteText'] if l['noteText'] else ''})")
                continue
            kind, tname = target
            q, u = l['quantity'], l['unit']
            approx = l['approx']
            original = f"{l['quantityText']}{' (' + l['noteText'] + ')' if l['noteText'] else ''}"
            if ov:
                q, u = ov['quantity'], ov['unit']; approx = ov.get('approx', approx); original = ov.get('original', original)
            line = OrderedDict([('ingredient' if kind == 'i' else 'recipe', tname), ('quantity', q), ('unit', u)])
            if approx or ov or (l['quantityText'] and not re.fullmatch(r'[\d.,]+\s*(g|ml|kg|l)', l['quantityText'].strip())):
                line['original'] = original
            line['approx'] = bool(approx)
            rec['lines'].append(line)
        recipes.append(rec)

    # The empanada assembly page is three menu dishes: one tapa + its filling.
    emp = by_name['Empanadas Mazcina - Armado, Formas y Servicio']
    for nm, fill, qty, orig, note in [
        ('Empanada de Carne Mazcina', ('r', 'Pino de Carne para Empanadas Mazcina'), 27.5, '25-30 g de pino', 'Cierre de 4 puntas'),
        ('Empanada de Camarón y Queso Mazcina', ('r', 'Pino de Camarón y Queso Mazcina'), 30, '30 g de relleno', 'Cierre triangular'),
        ('Empanada de Queso Mazcina', ('i', 'Gouda cheese'), 37.5, '35-40 g de Gouda', 'Semiesfera / media luna sellada con tenedor'),
    ]:
        recipes.append(OrderedDict(name=nm, type='dish', section='Entradas', portions=1, source=MANUAL, page=emp['page'],
            use=f'Empanada de cóctel. {note}.', yieldText='1 empanada', equipment=emp['equipment'], method=emp['method'],
            criticalPoints=emp['criticalPoints'], asNeeded=['Pebre Mazcina (1 pocillo, acompañamiento)', 'Mini Ensalada Mazcina (cantidad pequeña)', 'Aceite para freír'],
            pending=[], lines=[
                OrderedDict(recipe='Masa de Empanadas Mazcina', quantity=1, unit='each', original='1 tapa de 10 cm', approx=False),
                OrderedDict([('ingredient' if fill[0] == 'i' else 'recipe', fill[1]), ('quantity', qty), ('unit', 'g'), ('original', orig), ('approx', True)]),
            ]))

    # Sandwich extras with stated amounts -> one small recipe each (menu add-ons).
    ext = by_name['Estándar de Extras para Sándwiches Mazcina']
    for nm, target, qty, unit, orig in [
        ('Extra: Cebolla Estofada', ('r', 'Cebolla Estofada Mazcina'), 20, 'g', '20 g'),
        ('Extra: Tomate fresco', ('i', 'Tomatoes, round'), 55, 'g', '50-60 g'),
        ('Extra: Queso Gouda derretido', ('i', 'Gouda cheese'), 55, 'g', '50-60 g'),
        ('Extra: Huevo frito', ('i', 'Eggs'), 1, 'each', '1 unidad'),
        ('Extra: Palta molida', ('i', 'Avocado'), 90, 'g', '80-100 g'),
    ]:
        recipes.append(OrderedDict(name=nm, type='dish', section='Sándwiches', portions=1, source=MANUAL, page=ext['page'],
            use='Extra para sándwiches.', yieldText='1 porción', equipment=[], method=ext['method'], criticalPoints=ext['criticalPoints'],
            asNeeded=[], pending=[], lines=[OrderedDict([('ingredient' if target[0] == 'i' else 'recipe', target[1]), ('quantity', qty), ('unit', unit), ('original', orig), ('approx', orig != '20 g' and orig != '1 unidad')])]))

    # yields
    rec_by = {r['name']: r for r in recipes}
    def batch_weight(rec):
        total = 0.0
        for l in rec['lines']:
            q, u = l['quantity'], l['unit']
            if q == 'YIELD': continue
            if u in ('g', 'ml'): total += q
            elif u in ('kg', 'l'): total += q * 1000
            elif u == 'each' and l.get('ingredient') == 'Eggs': total += q * EGG_G
        return round(total)
    for rec in recipes:
        if rec['name'] in YIELD:
            q, u, est = YIELD[rec['name']]
            rec['yieldQuantity'], rec['yieldUnit'], rec['yieldEstimated'] = q, u, est
    # resolve "1 receta" lines, then estimate the rest of the preps (bottom-up)
    for _ in range(3):
        for rec in recipes:
            for l in rec['lines']:
                if l['quantity'] == 'YIELD':
                    sub = rec_by[l['recipe']]
                    if 'yieldQuantity' in sub: l['quantity'], l['unit'] = sub['yieldQuantity'], sub['yieldUnit']
            if rec['type'] == 'prep' and 'yieldQuantity' not in rec and not any(l['quantity'] == 'YIELD' for l in rec['lines']):
                rec['yieldQuantity'], rec['yieldUnit'], rec['yieldEstimated'] = batch_weight(rec), 'g', True
    # Estimates that follow the manual's own method rather than the raw sum (still flagged as estimates).
    EST_FIX = {
     'Cebolla Encurtida Mazcina': (2000, 'g', 'Estimado como el peso de la cebolla escurrida (el líquido de encurtido no se sirve).'),
     'Fumet de Pescado Mazcina': (4000, 'g', 'Estimado como el líquido (agua + vino); se filtran los sólidos.'),
     'Jugo Concentrado de Jengibre Mazcina': (1000, 'g', 'Estimado como el agua usada (proporción 1:1); se filtra la pulpa.'),
     'Salsa de Berries y Vino Tinto Mazcina': (450, 'g', 'Estimado a la mitad del total, porque el manual indica reducir a la mitad.'),
     'Ajo Confitado Mazcina': (1000, 'g', 'Estimado como el puré de ajo; el costo incluye todo el aceite, que también se usa aparte como aceite aromatizado.'),
    }
    for nm, (q, u, why) in EST_FIX.items():
        rec_by[nm].update(yieldQuantity=q, yieldUnit=u, yieldEstimated=True)
        rec_by[nm]['pending'].append(why)
    # liquids that are costed by the ml in dishes: measure the prep in ml, not g
    for nm in ['Fumet de Pescado Mazcina', 'Jugo Concentrado de Jengibre Mazcina', 'Dressing de Limón Mazcina', 'Salsa de Lomo Saltado Mazcina', 'Salsa de Berries y Vino Tinto Mazcina']:
        if rec_by[nm]['yieldUnit'] == 'g': rec_by[nm]['yieldUnit'] = 'ml'
    # dishes reference some preps by weight but the manual measures them by volume (and back): keep the manual's
    # number and treat 1 g = 1 ml for these sauces, flagged approx.
    for rec in recipes:
        for l in rec['lines']:
            if 'recipe' in l:
                sub = rec_by[l['recipe']]
                base_line = {'g': 'g', 'kg': 'g', 'ml': 'ml', 'l': 'ml', 'each': 'each'}[l['unit']]
                base_sub = {'g': 'g', 'kg': 'g', 'ml': 'ml', 'l': 'ml', 'each': 'each'}[sub['yieldUnit']]
                if base_line != base_sub and 'each' not in (base_line, base_sub):
                    l['original'] = l.get('original') or f"{l['quantity']} {l['unit']}"
                    l['unit'] = base_sub; l['approx'] = True
    for rec in recipes:
        if rec.get('yieldEstimated'):
            rec['pending'].append('Rendimiento estimado: pesar una producción completa y anotar el peso final.')
        if rec['type'] == 'dish' and 'yieldQuantity' in rec and rec['yieldUnit'] == 'g' and rec['yieldEstimated']:
            pass
        for k in list(rec):
            if rec[k] is None: del rec[k]
    return recipes


recipes = build()

PRICES = [
 # Bidfood I71906625.BOT, 15/10/2026, ex GST (GST 0.00 on every line)
 dict(ingredient='Prawn meat, raw 26/30', supplier='Bidfood', packSize=800, packUnit='g', packPrice=19.73, productCode='181868', description='PRAWN MEAT RAW 26/30 VANNAMEI (SEAFROST) (I), SEACREST 800gr PKT'),
 dict(ingredient='Prawn cutlets, raw 26/30 (tail on)', supplier='Bidfood', packSize=700, packUnit='g', packPrice=12.50, productCode='181866', description='PRAWN CUTLET RAW 26/30 VANNAMEI (SEAFROST) (I), SEACREST 700gr PKT'),
 dict(ingredient='Salmon portions, skinless 200 g', supplier='Bidfood', packSize=5, packUnit='kg', packPrice=157.50, productCode='80731', description='SALMON PORTIONS S/LESS 200GR (APP 25/CTN) (I), SEAFROST 5kg CTN'),
 dict(ingredient='Frozen berries', supplier='Bidfood', packSize=1, packUnit='kg', packPrice=4.84, productCode='210882', description='STRAWBERRIES WHOLE IQF, ENTYCE 1kg PKT'),
 dict(ingredient='Tomato ketchup', supplier='Bidfood', packSize=4, packUnit='kg', packPrice=22.93, productCode='508', description='KETCHUP TOMATO, HEINZ 4lt BTL (costed as 4 kg; ketchup is a little heavier than water)'),
 dict(ingredient='Red peppers, roasted, canned', supplier='Bidfood', packSize=4.15, packUnit='kg', packPrice=18.52, productCode='222234', description='PEPPERS RED ROASTED WHOLE, LA CARONA 4.15kg CAN'),
 dict(ingredient='Tomatoes, peeled, canned', supplier='Bidfood', packSize=2.5, packUnit='kg', packPrice=7.59, productCode='222500', description='TOMATOES PEELED ITALIAN, MAMA LATIN 2.5kg CAN'),
 dict(ingredient='Yeast, dry instant', supplier='Bidfood', packSize=500, packUnit='g', packPrice=3.70, productCode='11553', description='YEAST DRY INSTANT 500gr PKT'),
]
for p in PRICES: p.update(gstApplicable=False, priceIncludesGst=False, effectiveDate='2026-10-15', source='bidfood-i71906625')
MICKEYS = [
 ('Tomatoes, round', 1, 'kg', 5.50, 'Round Tomato Kg'),
 ('Button mushrooms', 1, 'kg', 12.00, 'Button Mushroom Kg'),
 ('Ginger', 1, 'kg', 28.00, 'Ginger Kg'),
 ('Rocket', 1, 'kg', 25.00, 'Rocket Kg'),
 ('Red capsicum', 1, 'kg', 7.00, 'Red Capsicum Kg'),
]
for ingn, size, unit, price, desc in MICKEYS:
    PRICES.append(dict(ingredient=ingn, supplier="Mickey's Fruit & Veg", packSize=size, packUnit=unit, packPrice=price, gstApplicable=False,
                       priceIncludesGst=False, effectiveDate='2026-08-31', source='mickeys-inv-23412', description=desc))

PRICES.append(dict(ingredient='Water', supplier='Mazcina (in house)', packSize=1, packUnit='l', packPrice=0, gstApplicable=False, priceIncludesGst=False, effectiveDate='2026-01-01', source='house-free-items', description='Tap water'))

MENU_LINKS = [
 ('Mushroom Ceviche', 'Ceviche de Champiñones Mazcina'), ('Napo Chicken Bites', 'Napo Chicken Bites Mazcina'),
 ('Baked Feta Pot', 'Baked Feta Pot Mazcina'), ('Mazcina Salmon Ceviche', 'Ceviche de Salmón Mazcina'), ('Mazcina Bravas', 'Mazcina Bravas'),
 ('Mazcina Garlic Prawns', 'Garlic Prawns Mazcina'), ('Crab Gratin', 'Crab Gratin Mazcina (Chupe de Jaiba)'),
 ('Cocktail Empanada: Beef', 'Empanada de Carne Mazcina'), ('Cocktail Empanada: Cheese', 'Empanada de Queso Mazcina'),
 ('Cocktail Empanada: Prawn & Cheese', 'Empanada de Camarón y Queso Mazcina'), ('Chorrillana', 'Chorrillana Mazcina'),
 ('Red Mechada Pasta', 'Red Mechada Pasta Mazcina'), ('Green Creamy Pasta', 'Green Creamy Pasta Mazcina'),
 ('Mazcina Grilled Barramundi', 'Grilled Barramundi Mazcina'), ('Saltado', 'Lomo Saltado Mazcina'),
 ('Mazcina Mediterranean Rice', 'Mediterranean Rice Mazcina (Arroz con Mariscos)'), ('Mazcina Salmon Cancato', 'Salmón Cancato Mazcina'),
 ('Barros Luco', 'Barros Luco Mazcina'), ('Fish Sandwich', 'Fish Sandwich Mazcina'), ('Mechada Sandwich', 'Mechada Italiana Mazcina'),
 ('Chilena Salad', 'Ensalada Chilena Mazcina - Servicio'), ('Mazcina Salad', 'Mazcina Salad'), ('Queen Avo Salad', 'Queen Avo Salad Mazcina'),
 ('Provenzal Potatoes', 'Papas Provenzal Mazcina'), ('Chicken, Fries and Salad', 'Kids Crispy Chicken Mazcina'),
 ('Fish Bites, Fries and Salad', 'Kids Crispy Barramundi Mazcina'), ('Four Milks', 'Cuatro Leches Mazcina'),
 ('Semolina Pudding', 'Pudín de Sémola con Berries y Vino Tinto'), ('Celestinos', 'Celestinos Mazcina'),
 ('Sandwich: Caramelized onion', 'Extra: Cebolla Estofada'), ('Sandwich: Fresh tomato slices', 'Extra: Tomate fresco'),
 ('Sandwich: Melted cheese', 'Extra: Queso Gouda derretido'), ('Sandwich: Fried egg', 'Extra: Huevo frito'),
 ('Sandwich: Smashed avocado', 'Extra: Palta molida'),
]

QUESTIONS = [
 ('Mini Ensalada Mazcina', 'What is the mix by weight for 100 g of mini salad (rocket, pickled onion, lemon dressing)?', 'It is on 15 dishes at 20 to 40 g but the manual gives no proportions, so it is not costed yet.'),
 ('Batch yields', 'Please weigh one finished batch of each base marked "Rendimiento estimado" (sauces, stocks, dressings, potatoes, rice, pasta, garlic confit, pickled onion and others).', 'Their yields are estimated from the raw ingredient weights. Cooking loses water, so the real cost per gram is probably higher.'),
 ('Manteca de Carne', 'Should rendered beef fat from trimmings be costed at $0, or at a price?', 'It comes from trimmings ("cantidad disponible"), so it has no purchase price.'),
 ('Manjar / dulce de leche', 'What size of condensed milk can is used, and how much manjar does one can make?', 'Celestinos and Cuatro Leches use manjar by weight; the manual only says "cantidad necesaria" of condensed milk.'),
 ('Cuatro Leches', 'Exact sizes of the condensed and evaporated milk cans, and the tray size.', 'Listed as pending in the manual.'),
 ('Mickey\'s invoice', 'How many kg are in the "Red Potato Bag" ($35) and in the "Lemon Box" ($50)?', 'Without the size these two prices cannot be costed.'),
 ('Bunches', 'Roughly how many grams is one bunch of coriander, mint and shallots from Mickey\'s ($1.50, $1.50, $2.50)?', 'Recipes use grams; the invoice sells by the bunch. One weighing per herb fixes it.'),
 ('Lemons and limes', 'Is "limón" in the manual a lemon or a lime? And roughly how much juice do you get from 1 kg?', 'Mickey\'s sells both; lemon juice is used in ml in many recipes.'),
 ('Orange', 'Roughly how many grams is one orange?', 'Recipes count oranges; Mickey\'s sells them by the kg.'),
 ('Avocado', 'Where do avocados come from and at what price (each or per kg)?', 'Avocado is in four dishes and has no price yet.'),
 ('Berries', 'Is the "berries congelados" in the berry sauce the Bidfood IQF strawberries, or a mixed berry pack?', 'The data uses the Bidfood strawberries price for now.'),
 ('Prawns', 'Are the "camarón cocido con cola" garnishes the Bidfood 26/30 raw cutlets, cooked in house?', 'The data assumes so, at about 16 g per prawn (26/30 per pound).'),
 ('Salad proteins', 'How many grams of chicken, barramundi and prawns go in each salad add-on (Grilled chicken $9, Barramundi bites $9, Garlic prawns $10.50)?', 'The manual says "1 porción" without a weight, so these add-ons are not costed.'),
 ('Boards and sides', 'Recipes for the Mazcina Earth Board, Ocean Board, a side of Chips, and one Sopaipilla (grams per piece).', 'They are on the menu but not in the manual.'),
 ('Other suppliers', 'Invoices or price lists for meat (rump, roast beef, chicken, chorizo), dairy (Gouda, cream, milk, butter), dry goods, oils and wine.', 'Most ingredients have no price yet, so most dishes show as incomplete until these arrive.'),
]

pack = OrderedDict(format='mazcina-kitchen-data', version=1, updated='2026-10-16', sources=SOURCES, suppliers=SUPPLIERS,
                   ingredients=list(ING.values()), prices=PRICES, recipes=recipes,
                   menuLinks=[dict(menuItem=a, recipe=b) for a, b in MENU_LINKS],
                   openQuestions=[dict(topic=a, question=b, why=c) for a, b, c in QUESTIONS],
                   serviceConventions=NOTES.get('serviceConventions', []))
used = {l.get('ingredient') for r in recipes for l in r['lines']} | {p['ingredient'] for p in PRICES} | {'Mint, fresh'}
unused = [i for i in ING if i not in used]
if unused: print('unused ingredients:', unused, file=sys.stderr)
json.dump(pack, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f"{len(ING)} ingredients, {len(PRICES)} prices, {len(recipes)} recipes ({sum(r['type']=='prep' for r in recipes)} preps), {len(MENU_LINKS)} menu links, {len(QUESTIONS)} questions")
