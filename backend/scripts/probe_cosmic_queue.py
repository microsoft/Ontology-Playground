from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app


def main() -> None:
    client = TestClient(app)
    payload = {
        "editor_id": "check_final_queue",
        "ontology": {
            "name": "Cosmic Coffee Company",
            "description": "A sample ontology representing a modern coffee shop chain with suppliers, products, stores, customers, and orders.",
            "entityTypes": [
                {
                    "id": "customer",
                    "name": "Customer",
                    "description": "A person who purchases coffee products from our stores",
                    "icon": "👤",
                    "color": "#0078D4",
                    "properties": [
                        {"name": "customerId", "type": "string", "isIdentifier": True, "description": "Unique customer identifier"},
                        {"name": "name", "type": "string", "description": "Full name of the customer"},
                    ],
                },
                {
                    "id": "order",
                    "name": "Order",
                    "description": "A customer purchase transaction at a store",
                    "icon": "🧾",
                    "color": "#107C10",
                    "properties": [
                        {"name": "orderId", "type": "string", "isIdentifier": True, "description": "Unique order identifier"},
                        {"name": "timestamp", "type": "datetime", "description": "When the order was placed"},
                        {"name": "total", "type": "decimal", "description": "Total order amount"},
                        {"name": "status", "type": "enum", "values": ["Pending", "Preparing", "Ready", "Completed", "Cancelled"], "description": "Current order status"},
                        {"name": "paymentMethod", "type": "enum", "values": ["Card", "Cash", "Mobile", "Gift Card"], "description": "Payment method used"},
                    ],
                },
                {
                    "id": "product",
                    "name": "Product",
                    "description": "A coffee product or item available for sale",
                    "icon": "☕",
                    "color": "#5C2D91",
                    "properties": [
                        {"name": "productId", "type": "string", "isIdentifier": True, "description": "Unique product identifier"},
                        {"name": "name", "type": "string", "description": "Product name"},
                    ],
                },
                {
                    "id": "store",
                    "name": "Store",
                    "description": "A physical coffee shop location",
                    "icon": "🏪",
                    "color": "#FFB900",
                    "properties": [
                        {"name": "storeId", "type": "string", "isIdentifier": True, "description": "Unique store identifier"},
                        {"name": "name", "type": "string", "description": "Store name"},
                    ],
                },
                {
                    "id": "supplier",
                    "name": "Supplier",
                    "description": "A coffee bean or goods supplier partner",
                    "icon": "🚚",
                    "color": "#D83B01",
                    "properties": [
                        {"name": "supplierId", "type": "string", "isIdentifier": True, "description": "Unique supplier identifier"},
                        {"name": "name", "type": "string", "description": "Supplier company name"},
                    ],
                },
                {
                    "id": "shipment",
                    "name": "Shipment",
                    "description": "A delivery of goods from supplier to store",
                    "icon": "📦",
                    "color": "#00A9E0",
                    "properties": [
                        {"name": "shipmentId", "type": "string", "isIdentifier": True, "description": "Unique shipment identifier"},
                        {"name": "status", "type": "enum", "values": ["In Transit", "Delivered", "Delayed"], "description": "Shipment status"},
                    ],
                },
            ],
            "relationships": [
                {"id": "customer_places_order", "name": "places", "from": "customer", "to": "order", "cardinality": "one-to-many", "description": "A customer places one or more orders"},
                {"id": "order_contains_product", "name": "contains", "from": "order", "to": "product", "cardinality": "many-to-many", "description": "An order contains one or more products", "attributes": [{"name": "quantity", "type": "integer"}, {"name": "customizations", "type": "string"}]},
                {"id": "order_processed_at_store", "name": "processedAt", "from": "order", "to": "store", "cardinality": "many-to-one", "description": "An order is processed at a specific store"},
                {"id": "product_sourced_from_supplier", "name": "sourcedFrom", "from": "product", "to": "supplier", "cardinality": "many-to-one", "description": "A product's ingredients are sourced from a supplier"},
                {"id": "shipment_from_supplier", "name": "sentBy", "from": "shipment", "to": "supplier", "cardinality": "many-to-one", "description": "A shipment is sent by a supplier"},
                {"id": "shipment_to_store", "name": "deliveredTo", "from": "shipment", "to": "store", "cardinality": "many-to-one", "description": "A shipment is delivered to a store"},
                {"id": "shipment_contains_product", "name": "carries", "from": "shipment", "to": "product", "cardinality": "many-to-many", "description": "A shipment carries products", "attributes": [{"name": "quantity", "type": "integer"}]},
            ],
        },
        "source_documents": [
            {
                "source_doc_id": "doc1",
                "source_doc_name": "probe.txt",
                "doc_type": "maintenance_log",
                "page": 1,
                "text": "[2026-04-01 08:15] 고객 CUST-102 (백진암)가 STR-22 (강남점) 매장에서 주문 ORD-5001을 생성함. 주문 ORD-5001은 제품 PROD-01 (시그니처 에스프레소) 2잔을 포함하며, 샷 추가 옵션이 선택됨. 주문 ORD-5001의 총 결제 금액은 12,500원이며, 모바일 결제로 완료됨. 상태: 결제완료.",
            }
        ],
    }

    response = client.post("/api/graph/generate", json=payload)
    print("STATUS", response.status_code)
    body = response.json()
    print(json.dumps(body["queue"]["items"] if response.status_code == 200 else body, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
