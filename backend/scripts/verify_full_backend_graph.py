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
        "editor_id": "full_backend_check",
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
                        {"name": "dispatchDate", "type": "date", "description": "Date shipped from supplier"},
                        {"name": "arrivalDate", "type": "date", "description": "Date arrived at store"},
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
                "source_doc_id": "coffee_demo_001",
                "source_doc_name": "coffee-demo.txt",
                "doc_type": "text_upload",
                "page": 1,
                "text": """[2026-04-01 08:15] 고객 CUST-102 (백진암)가 STR-22 (강남점) 매장에서 주문 ORD-5001을 생성함.

주문 ORD-5001은 제품 PROD-01 (시그니처 에스프레소) 2잔을 포함하며, '샷 추가' 옵션이 선택됨.

주문 ORD-5001의 총 결제 금액은 12,500원이며, 모바일 결제로 완료됨. 상태: 결제완료.

[2026-04-01 09:30] 강남점(STR-22)에서 재고 알림 발생: 제품 PROD-01의 원두 재고가 부족함.

공급업체 SUP-88 (에코빈 브라질)이 강남점(STR-22)으로 배송 건 SHP-9001을 발송함.

배송 건 SHP-9001은 제품 PROD-01 원두 50kg을 포함함. 상태: 운송 중. 발송일: 2026-03-28.

[2026-04-02 14:20] 고객 CUST-103 (서민기)가 STR-05 (울산 유니스트점) 매장에서 주문 ORD-5002를 생성함.

주문 ORD-5002는 제품 PROD-05 (콜드브루) 1잔과 제품 PROD-12 (기획상품 텀블러) 1개를 포함함.

주문 ORD-5002의 총 결제 금액은 35,000원이며, 신용카드로 결제됨. 상태: 결제완료.

제품 PROD-01 (시그니처 에스프레소)의 원천 공급지는 SUP-88 (평점: 4.8, 인증: 공정무역)임.

[2026-04-02 18:00] 배송 건 SHP-9001이 강남점(STR-22)에 도착함. 상태: 배송완료. 도착일: 2026-04-02."""
            }
        ],
    }

    generate = client.post("/api/graph/generate", json=payload)
    print("GENERATE_STATUS", generate.status_code)
    body = generate.json()
    if generate.status_code != 200:
        print(json.dumps(body, ensure_ascii=False, indent=2))
        return

    items = body["queue"]["items"]
    print("QUEUE_COUNT", len(items))
    print(json.dumps(items, ensure_ascii=False, indent=2))

    schema_version_id = body["schema"]["schema_version_id"]
    for index, item in enumerate(items, start=1):
        lock = client.post(
            f"/api/queue/{item['candidate_id']}/lock",
            json={"reviewer_id": "bulk_reviewer", "lock_timeout_seconds": 300},
        )
        print("LOCK", item["candidate_id"], lock.status_code)

        review = client.post(
            "/api/reviews",
            json={
                "candidate_id": item["candidate_id"],
                "schema_version_id": schema_version_id,
                "reviewer_id": "bulk_reviewer",
                "action": "APPROVE",
                "mapped_subject_class_id": item["suggestions"]["subject"][0]["target_id"],
                "mapped_relation_id": item["suggestions"]["relation"][0]["target_id"],
                "mapped_object_class_id": item["suggestions"]["object"][0]["target_id"],
                "reason_code": "MATCH_CONFIRMED",
                "comment": f"Auto-approved for backend graph verification #{index}",
                "idempotency_key": f"bulk-verify-{index}",
            },
        )
        print("REVIEW", item["candidate_id"], review.status_code)

    facts = client.get("/api/reviews/approved-facts")
    print("FACTS_STATUS", facts.status_code)
    print(json.dumps(facts.json(), ensure_ascii=False, indent=2))

    graph = client.get("/api/reviews/instance-graph")
    print("GRAPH_STATUS", graph.status_code)
    print(json.dumps(graph.json(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
