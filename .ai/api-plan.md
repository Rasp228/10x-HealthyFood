# REST API Plan

## 1. Resources

- **Preferences** - corresponds to the `preferences` table in the database
- **Recipes** - corresponds to the `recipes` table in the database
- **Logs** - corresponds to the `logs` table in the database
- **Users** - uses the `auth.users` table from Supabase Auth

## 2. Endpoints

### 2.1. Preferences

#### GET /api/preferences

- **Description**: Retrieve a list of user's food preferences
- **Query parameters**:
  - `category` (optional): filter by category ('lubiane', 'nielubiane', 'wykluczone', 'diety')
- **Response**:
  ```json
  {
    "data": [
      {
        "id": 1,
        "user_id": "uuid",
        "category": "lubiane",
        "value": "strawberries",
        "created_at": "2023-09-10T12:00:00Z"
      }
    ],
    "total": 42
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 401 Unauthorized, 500 Internal Server Error

#### GET /api/preferences/:id

- **Description**: Retrieve details of a specific preference
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "category": "lubiane",
    "value": "strawberries",
    "created_at": "2023-09-10T12:00:00Z"
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 401 Unauthorized, 404 Not Found, 500 Internal Server Error

#### POST /api/preferences

- **Description**: Add a new food preference
- **Request**:
  ```json
  {
    "category": "lubiane",
    "value": "strawberries"
  }
  ```
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "category": "lubiane",
    "value": "strawberries",
    "created_at": "2023-09-10T12:00:00Z"
  }
  ```
- **Success codes**: 201 Created
- **Error codes**: 400 Bad Request, 401 Unauthorized, 422 Unprocessable Entity, 500 Internal Server Error

#### PUT /api/preferences/:id

- **Description**: Update an existing preference
- **Request**:
  ```json
  {
    "category": "lubiane",
    "value": "raspberries"
  }
  ```
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "category": "lubiane",
    "value": "raspberries",
    "created_at": "2023-09-10T12:00:00Z"
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 400 Bad Request, 401 Unauthorized, 404 Not Found, 422 Unprocessable Entity, 500 Internal Server Error

#### DELETE /api/preferences/:id

- **Description**: Delete a preference
- **Response**: 204 No Content
- **Success codes**: 204 No Content
- **Error codes**: 401 Unauthorized, 404 Not Found, 500 Internal Server Error

### 2.2. Recipes

#### GET /api/recipes

- **Description**: Retrieve a list of user's recipes
- **Query parameters**:
  - `sort` (optional): sort field ('created_at', 'updated_at', 'title')
  - `order` (optional): sort direction ('asc', 'desc')
- **Response**:
  ```json
  {
    "data": [
      {
        "id": 1,
        "user_id": "uuid",
        "title": "Fruit Salad",
        "content": "Preparation method...",
        "additional_params": "Additional information...",
        "created_at": "2023-09-10T12:00:00Z",
        "updated_at": "2023-09-10T12:00:00Z"
      }
    ],
    "total": 5
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 401 Unauthorized, 500 Internal Server Error

#### GET /api/recipes/:id

- **Description**: Retrieve details of a specific recipe
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "title": "Fruit Salad",
    "content": "Preparation method...",
    "additional_params": "Additional information...",
    "created_at": "2023-09-10T12:00:00Z",
    "updated_at": "2023-09-10T12:00:00Z"
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 401 Unauthorized, 404 Not Found, 500 Internal Server Error

#### POST /api/recipes

- **Description**: Add a new recipe
- **Request**:
  ```json
  {
    "title": "Fruit Salad",
    "content": "Preparation method...",
    "additional_params": "Additional information..."
  }
  ```
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "title": "Fruit Salad",
    "content": "Preparation method...",
    "additional_params": "Additional information...",
    "created_at": "2023-09-10T12:00:00Z",
    "updated_at": "2023-09-10T12:00:00Z"
  }
  ```
- **Success codes**: 201 Created
- **Error codes**: 400 Bad Request, 401 Unauthorized, 422 Unprocessable Entity, 500 Internal Server Error

#### PUT /api/recipes/:id

- **Description**: Update an existing recipe
- **Request**:
  ```json
  {
    "title": "Modified Fruit Salad",
    "content": "New preparation method...",
    "additional_params": "New additional information..."
  }
  ```
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "title": "Modified Fruit Salad",
    "content": "New preparation method...",
    "additional_params": "New additional information...",
    "created_at": "2023-09-10T12:00:00Z",
    "updated_at": "2023-09-15T14:30:00Z"
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 400 Bad Request, 401 Unauthorized, 404 Not Found, 422 Unprocessable Entity, 500 Internal Server Error

#### DELETE /api/recipes/:id

- **Description**: Delete a recipe
- **Response**: 204 No Content
- **Success codes**: 204 No Content
- **Error codes**: 401 Unauthorized, 404 Not Found, 500 Internal Server Error

### 2.3. AI Integration

#### POST /api/ai/generate-recipe

- **Description**: Generate a new recipe using AI
- **Request**:
  ```json
  {
    "additional_params": "Parameters for AI..."
  }
  ```
- **Response**:
  ```json
  {
    "recipe": {
      "title": "Generated Recipe",
      "content": "Generated recipe content...",
      "additional_params": "Parameters for AI..."
    },
    "ai_model": "model_name",
    "generate_response_time": 1500
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 400 Bad Request, 401 Unauthorized, 500 Internal Server Error

#### POST /api/ai/modify-recipe/:id

- **Description**: Modify an existing recipe using AI
- **Request**:
  ```json
  {
    "additional_params": "Modification parameters for AI..."
  }
  ```
- **Response**:
  ```json
  {
    "original_recipe": {
      "id": 1,
      "title": "Original Recipe",
      "content": "Original recipe content..."
    },
    "modified_recipe": {
      "title": "Modified Recipe",
      "content": "Modified recipe content...",
      "additional_params": "Modification parameters for AI..."
    },
    "ai_model": "model_name",
    "generate_response_time": 1500
  }
  ```
- **Success codes**: 200 OK
- **Error codes**: 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Server Error

#### POST /api/ai/save-recipe

- **Description**: Save a generated/modified recipe
- **Request**:
  ```json
  {
    "recipe": {
      "title": "Recipe Title",
      "content": "Recipe content...",
      "additional_params": "Additional parameters..."
    },
    "is_new": false
  }
  ```
- **Response**:
  ```json
  {
    "id": 1,
    "user_id": "uuid",
    "title": "Recipe Title",
    "content": "Recipe content...",
    "additional_params": "Additional parameters...",
    "created_at": "2023-09-10T12:00:00Z",
    "updated_at": "2023-09-15T14:30:00Z"
  }
  ```
- **Success codes**: 200 OK (if updated), 201 Created (if created new)
- **Error codes**: 400 Bad Request, 401 Unauthorized, 404 Not Found, 422 Unprocessable Entity, 500 Internal Server Error

## 3. Authentication and Authorization

The application uses Supabase Auth for authentication and authorization:

- Users register and log in through Supabase Auth
- API requires a JWT token in the `Authorization: Bearer [token]` header
- Token is verified by Supabase middleware
- Authorization is implemented through Row-Level Security (RLS) in the database
- Each user has access only to their own data (preferences, recipes, and logs)

## 4. Validation and Business Logic

### 4.1. Preferences

- Category must be one of: 'lubiane', 'nielubiane', 'wykluczone', 'diety'
- Preference value must be non-empty and no longer than 50 characters
- A user can have a maximum of 50 different preferences
- The combination of (user_id, category, value) must be unique
- User profile is considered complete after saving at least 3 preferences

### 4.2. Recipes

- Recipe title must be non-empty
- Recipe content must be non-empty and no longer than 5000 characters
- Additional parameters cannot be longer than 5000 characters

### 4.3. AI Integration

- Generating a new recipe requires a completed profile (min. 3 preferences)
- Modifying a recipe requires an existing recipe and a completed profile
- When saving a modified recipe, the user can choose whether to save it as new or overwrite the existing one
- The system automatically creates a log for each AI action with information about the model, generation time, and result

### 4.4. Logs

- Automatically created for actions of type 'generate_new' and 'generate_modification'
- Store information about the AI model, generation time, and whether the user accepted the result
- Available only to system administrators and the user they concern (through RLS)
