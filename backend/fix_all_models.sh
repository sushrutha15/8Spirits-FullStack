#!/bin/bash

echo "🔧 Fixing all model files..."

# Array of model files to fix
models=(
  "User"
  "Product"
  "Coupon"
  "GiftCard"
  "Subscription"
  "Store"
  "Notification"
  "Wishlist"
  "Analytics"
)

for model in "${models[@]}"; do
  file="models/${model}.js"
  
  if [ -f "$file" ]; then
    # Get the last line
    last_line=$(tail -n 1 "$file")
    
    # Check if it needs fixing
    if [[ $last_line == *"mongoose.model"* ]] && [[ $last_line != *"mongoose.models"* ]]; then
      # Remove last line
      sed -i '' '$ d' "$file"
      
      # Add fixed line
      echo "module.exports = mongoose.models.${model} || mongoose.model('${model}', ${model,,}Schema);" >> "$file"
      
      echo "✓ Fixed $file"
    else
      echo "⊘ $file already fixed or doesn't need fixing"
    fi
  else
    echo "⚠️  $file not found"
  fi
done

echo ""
echo "✅ All model files fixed!"
