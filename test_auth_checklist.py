import urllib.request
import urllib.error
import json

def test_ep(name, url, method='GET', data=None, headers=None):
    if headers is None:
        headers = {}
    print(f"=== Testing: {name} ===")
    req_data = json.dumps(data).encode('utf-8') if data else None
    req_headers = {'Content-Type': 'application/json', **headers}
    req = urllib.request.Request(url, data=req_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Status: {resp.status}")
            print(f"Response: {resp.read().decode('utf-8')}")
    except urllib.error.HTTPError as e:
        print(f"Status: {e.code}")
        print(f"Error Response: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error: {e}")
    print()

if __name__ == "__main__":
    # 1. Login with wrong password
    test_ep("1. Login with wrong password", "http://localhost:8000/api/auth/login", "POST", {"email": "admin@radio.com", "password": "wrongpassword"})

    # 2. Login with valid credentials
    test_ep("2. Login with valid credentials", "http://localhost:8000/api/auth/login", "POST", {"email": "admin@radio.com", "password": "radio@1"})

    # 3. Accessing protected route /api/reports without token
    test_ep("3. Protected route check: GET /api/reports without token", "http://localhost:8000/api/reports", "GET")

    # 4. Accessing protected doctor creation without token
    test_ep("4. Protected route check: POST /api/doctors without token", "http://localhost:8000/api/doctors", "POST", {"firstName": "Test", "lastName": "Doc", "fullName": "Dr. Test Doc", "email": "testdoc@example.com", "contactNumber": "1234567890"})
