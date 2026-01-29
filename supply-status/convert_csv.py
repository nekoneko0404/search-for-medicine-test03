import csv
import json

# Read CSV and create unique ingredient list
ingredients = {}
with open('data/supply_medicines.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        ingredient = row['成分名']
        category = row['R7年度カテゴリ分類案']
        ingredients[ingredient] = category

# Convert to list format
result = [
    {'ingredient_name': name, 'category': cat}
    for name, cat in sorted(ingredients.items(), key=lambda x: (x[1], x[0]))
]

# Write to JSON
with open('data/category_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'Created category_data.json with {len(result)} unique ingredients')
