import React, { memo, useCallback } from "react";
import { Product } from "@/hooks/useProducts";

interface ProductGridItemProps {
  product: Product;
  onClick: (product: Product) => void;
}

export const ProductGridItem = memo(function ProductGridItem({ product, onClick }: ProductGridItemProps) {
  const handleClick = useCallback(() => {
    onClick(product);
  }, [product, onClick]);

  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-start p-3 rounded-lg border bg-card text-left transition-colors hover:bg-accent hover:border-primary"
    >
      <span className="font-medium text-sm line-clamp-2">{product.name}</span>
      {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
      <span className="mt-auto pt-1 font-semibold text-primary">KES {Number(product.selling_price).toLocaleString()}</span>
    </button>
  );
});

ProductGridItem.displayName = "ProductGridItem";
