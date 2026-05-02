# Branch Transfer Request Workflow Implementation

## Overview
This document describes the complete implementation of the Branch Transfer Request workflow for Walk-in to Enrollment conversion in the CRM system.

## Database Model

### BranchTransferRequest Model
Located in: `crm/models.py`

```python
class BranchTransferRequest(TimeStampedModel):
    walkin = ForeignKey(WalkIn)  # The walk-in being transferred
    candidate_name = CharField  # Candidate's name
    phone = CharField  # Candidate's phone
    current_branch = ForeignKey(Branch)  # Original walk-in branch
    requested_branch = ForeignKey(Branch)  # Requested enrollment branch
    course = ForeignKey(Course)  # Course to enroll
    requested_by = ForeignKey(User)  # User who initiated the transfer
    reason = TextField  # Transfer reason/remarks
    status = CharField  # Pending, Approved, Rejected
    enrollment_payload = JSONField  # Enrollment data for later creation
    enrollment = OneToOneField(Enrollment)  # Created enrollment (on approval)
    reviewed_by = ForeignKey(User)  # Admin who approved/rejected
    reviewed_at = DateTimeField  # Approval/rejection timestamp
    review_remarks = TextField  # Admin's comments on approval/rejection
```

### WalkIn Model Update
- Added status choice: `TRANSFERRED = 'transferred'`

## Backend API Endpoints

### 1. Convert Walk-in to Enrollment
**POST** `/api/walkins/{id}/convert-to-enrollment/`

**Request Body:**
```json
{
  "branch": 1,
  "name": "John Doe",
  "phone": "9876543210",
  "email": "john@example.com",
  "dob": "2000-01-15",
  "location": "Downtown",
  "pincode": "641001",
  "course": 1,
  "preferred_timing": "weekday_morning",
  "enrollment_date": "2024-04-29",
  "actual_fees": 50000,
  "discount": 2,
  "start_date": "2024-05-01",
  "transfer_reason": "Candidate prefers branch near home"
}
```

**Response (Same Branch - Direct Enrollment):**
```json
{
  "id": 123,
  "student_number": "202401-0001",
  "name": "John Doe",
  "status": "active",
  "enrollment_date": "2024-04-29"
}
```

**Response (Different Branch - Transfer Request Created):**
```json
{
  "transfer_requested": true,
  "transfer_request": {
    "id": 45,
    "walkin": 99,
    "candidate_name": "John Doe",
    "phone": "9876543210",
    "current_branch": 1,
    "current_branch_name": "Gandhipuram",
    "requested_branch": 2,
    "requested_branch_name": "Hopes",
    "course": 1,
    "course_name": "Python",
    "requested_by": 5,
    "requested_by_name": "Alice Johnson",
    "reason": "Candidate prefers branch near home",
    "status": "pending",
    "created_at": "2024-04-29T10:30:00Z"
  }
}
```

### 2. List Transfer Requests
**GET** `/api/transfer-requests/`

**Query Parameters:**
- `status` - Filter by pending/approved/rejected
- `walkin` - Filter by walk-in ID
- `requested_by` - Filter by requesting user
- `current_branch` - Filter by current branch
- `requested_branch` - Filter by requested branch

**Response:**
```json
{
  "count": 10,
  "results": [
    {
      "id": 45,
      "walkin": 99,
      "candidate_name": "John Doe",
      "phone": "9876543210",
      "current_branch_name": "Gandhipuram",
      "requested_branch_name": "Hopes",
      "course_name": "Python",
      "requested_by_name": "Alice Johnson",
      "reason": "Candidate prefers branch near home",
      "status": "pending",
      "created_at": "2024-04-29T10:30:00Z",
      "reviewed_at": null,
      "reviewed_by_name": null,
      "review_remarks": ""
    }
  ]
}
```

### 3. Approve Transfer Request
**POST** `/api/transfer-requests/{id}/approve/`

**Request Body:**
```json
{
  "review_remarks": "Approved. Candidate location verified."
}
```

**Logic:**
1. Creates Enrollment record under requested branch
2. Creates Payment record (UNPAID status)
3. Sets WalkIn status to TRANSFERRED
4. Links Enrollment to Transfer Request
5. Updates Walk-in remarks to show transfer destination

**Response:**
```json
{
  "id": 45,
  "status": "approved",
  "enrollment": 123,
  "reviewed_by": 7,
  "reviewed_by_name": "Admin User",
  "reviewed_at": "2024-04-29T11:00:00Z",
  "review_remarks": "Approved. Candidate location verified."
}
```

### 4. Reject Transfer Request
**POST** `/api/transfer-requests/{id}/reject/`

**Request Body:**
```json
{
  "review_remarks": "Student should visit requested branch first."
}
```

**Logic:**
1. Sets status to REJECTED
2. Keeps walk-in in original branch
3. Saves admin's reason/remarks

**Response:**
```json
{
  "id": 45,
  "status": "rejected",
  "reviewed_by": 7,
  "reviewed_by_name": "Admin User",
  "reviewed_at": "2024-04-29T11:00:00Z",
  "review_remarks": "Student should visit requested branch first."
}
```

## Frontend Components

### 1. WalkInDetailPage
**File:** `frontend/src/pages/walkins/WalkInDetailPage.jsx`

**Features:**
- Enrollment branch selection dropdown
- Automatic branch change detection
- Confirmation prompt for branch transfers
- Transfer reason/remarks field (shown only when branch differs)
- Display of pending transfer request status

**User Flow:**
1. User selects enrollment branch different from walk-in branch
2. Warning message appears: "This candidate belongs to another branch. Do you want to request branch transfer for enrollment?"
3. User can optionally add transfer reason
4. On form submission:
   - If branch is same: Direct enrollment creation
   - If branch differs: Transfer request creation with status display

### 2. TransferRequestsPage
**File:** `frontend/src/pages/admin/TransferRequestsPage.jsx`

**Features:**
- Table view of all transfer requests
- Filter by status (Pending/Approved/Rejected)
- Displays: Candidate name, phone, branch transfer details, course, requested by, date
- Approve/Reject buttons for pending requests
- Optional admin remarks collection
- Status badges with color coding

**Permissions:**
- Only Super Admin can access
- Only Super Admin can approve/reject

### 3. DashboardPage Updates
**File:** `frontend/src/pages/dashboard/DashboardPage.jsx`

**Features:**
- Displays pending transfer request count
- Link to transfer requests page for admins
- Shows in follow-up section alongside other pending items

## Access Control

### Role-Based Access

**Super Admin:**
- ✅ View all transfer requests
- ✅ Approve/reject transfer requests
- ✅ View transfer requests from any user
- ✅ Access Transfer Requests admin page

**Staff User:**
- ✅ Create transfer requests (by converting walk-in)
- ✅ View their own transfer requests
- ❌ Approve/reject transfer requests
- ❌ Access Transfer Requests admin page
- ✅ View transfer request status on walk-in detail page

**Branch-Based Filtering:**
- Staff can only work with walk-ins from their assigned branch
- Transfer requests filtered by current/requested branch for staff
- Admins see all transfer requests globally

## Workflow Scenarios

### Scenario 1: Same Branch Enrollment (Existing Behavior)
1. Staff selects walk-in
2. Chooses same branch for enrollment
3. Fills enrollment details
4. Clicks "Convert to Enrollment"
5. **Result:** Enrollment created immediately under same branch

### Scenario 2: Different Branch - Approved
1. Staff selects walk-in from Branch A
2. Chooses different branch (Branch B) for enrollment
3. System shows confirmation prompt
4. Staff provides transfer reason (optional)
5. Click "Convert to Enrollment"
6. **Result:** Transfer request created with PENDING status
7. Admin reviews transfer request
8. Admin clicks "Approve" with optional remarks
9. **Result:**
   - Enrollment created under Branch B
   - Walk-in status → TRANSFERRED
   - Transfer request status → APPROVED
   - Walk-in shows transfer destination in remarks
   - Enrollment visible to Branch B staff only
   - Revenue attributed to Branch B

### Scenario 3: Different Branch - Rejected
1-6. Same as Scenario 2 up to creation
7. Admin reviews transfer request
8. Admin clicks "Reject" with reason (e.g., "Student needs to complete profile")
9. **Result:**
   - Transfer request status → REJECTED
   - Walk-in remains in Branch A
   - No enrollment created
   - Admin remarks saved for follow-up

## Key Features

### 1. Branch-Based Data Isolation
- Each branch staff only sees walk-ins assigned to their branch
- Transfer requests visible to relevant branch staff
- Enrollments tracked per branch for reporting

### 2. Admin Governance
- All cross-branch transfers require admin approval
- Admin can add remarks on approval/rejection for audit trail
- Prevents unauthorized branch changes

### 3. Enrollment Integrity
- Duplicate enrollment prevention (one-to-one relationship)
- Enrollment payload preserved in transfer request for exact replication
- Payment record auto-created on approval

### 4. Status Tracking
- Walk-in status changes: NEW → FOLLOW_UP → TRANSFERRED
- Transfer request status: PENDING → APPROVED/REJECTED
- Remarks preserved for audit and follow-up

### 5. Dashboard Integration
- Pending transfer count displayed for admins
- Quick link to review pending transfers
- Included in follow-up items

## UI/UX Considerations

### Confirmation Dialogs
- Clear messaging when branch differs
- Optional remarks field for context
- Confirmation required before sending transfer request

### Status Displays
- Color-coded status badges (pending=amber, approved=emerald, rejected=rose)
- Admin remarks displayed in table for transparency
- Requested date and approval date both shown

### Validation
- Required fields validation before submission
- Duplicate transfer prevention (only one pending per walk-in)
- Course and branch existence verification

## Audit Trail

**Captured Information:**
- Candidate name and phone
- Current and requested branches
- Course information
- Requesting user (who initiated transfer)
- Reason/remarks from requester
- Reviewing admin (who approved/rejected)
- Review date/time
- Admin remarks on decision

## Error Handling

**Possible Errors:**
1. Walk-in already has approved enrollment → HTTP 400
2. Walk-in already has pending transfer → HTTP 202 (show existing)
3. Invalid branch/course selection → HTTP 400
4. Only admin can approve/reject → HTTP 403
5. Transfer already processed → HTTP 400

## Testing Checklist

- [ ] Staff can convert walk-in to enrollment (same branch)
- [ ] Staff can initiate transfer request (different branch)
- [ ] Transfer request created with correct data
- [ ] Admin can view pending transfer requests
- [ ] Admin can approve transfer request
- [ ] Enrollment created under requested branch on approval
- [ ] Walk-in status updated to TRANSFERRED
- [ ] Admin can reject transfer request
- [ ] Walk-in remains in original branch on rejection
- [ ] Admin remarks saved for both approval and rejection
- [ ] Dashboard shows pending transfer count
- [ ] Branch staff cannot approve/reject transfers
- [ ] Only admins can access transfer requests page
- [ ] Transfer request status visible on walk-in detail page
- [ ] Duplicate transfer prevention working
- [ ] Payment record auto-created on enrollment
- [ ] Enrollment revenue attributed to correct branch

## Future Enhancements

1. **Email Notifications**
   - Notify admin when transfer request created
   - Notify requesting staff on approval/rejection

2. **Transfer Limits**
   - Configurable transfer request limits per branch
   - Transfer reason categorization

3. **Bulk Operations**
   - Batch approve/reject multiple transfer requests
   - Transfer request analytics and reporting

4. **Compliance**
   - SLA tracking for transfer request review time
   - Denial reason categories

5. **Integrations**
   - WhatsApp notification to candidate on transfer approval
   - Auto-assignment to enrolled branch staff
