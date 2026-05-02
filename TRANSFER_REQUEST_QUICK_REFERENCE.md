# Branch Transfer Request Workflow - Quick Reference

## ✅ Implementation Summary

The Branch Transfer Request workflow has been fully implemented. Here's what's available:

## Backend Components ✓

### 1. Models
- **BranchTransferRequest**: Complete with all required fields (candidate info, branches, status, approval tracking)
- **WalkIn**: Updated with new status `TRANSFERRED`
- **Migration**: 0016_branchtransferrequest_walkin_transferred.py (ready to apply)

### 2. API Endpoints
- `POST /api/walkins/{id}/convert-to-enrollment/` - Convert walk-in (creates transfer if branch differs)
- `GET /api/transfer-requests/` - List requests (filtered by role)
- `POST /api/transfer-requests/{id}/approve/` - Admin approves transfer
- `POST /api/transfer-requests/{id}/reject/` - Admin rejects transfer

### 3. Business Logic
- ✓ Automatic detection of branch mismatch during conversion
- ✓ Transfer request creation instead of direct enrollment
- ✓ Enrollment creation on approval
- ✓ Payment record auto-creation
- ✓ Duplicate enrollment prevention
- ✓ Admin-only approval/rejection
- ✓ Comprehensive audit trail

## Frontend Components ✓

### 1. Pages
- **WalkInDetailPage** (`/walkins/{id}`)
  - Branch selection dropdown
  - Automatic branch change detection
  - Transfer reason field (conditional)
  - Pending transfer status display
  - Direct enrollment or transfer request based on branch

- **TransferRequestsPage** (`/admin/transfer-requests`)
  - Admin-only page (protected by AdminRoute)
  - Table of all transfer requests
  - Approve/Reject buttons for pending requests
  - Admin remarks collection
  - Status filtering
  - Comprehensive request details

- **DashboardPage** (`/dashboard`)
  - Pending transfer request count (admin only)
  - Quick link to transfer requests page

### 2. Features Implemented
- ✓ Role-based access control
- ✓ Branch-based data isolation
- ✓ Status tracking (Pending→Approved/Rejected)
- ✓ Confirmation dialogs
- ✓ Error handling
- ✓ Admin remarks/comments

## User Workflows

### For Branch Staff: Converting Walk-in to Enrollment

1. Navigate to Walk-in detail page: `/walkins/{id}`
2. Fill in the "Convert to Enrollment" section on the right:
   - Select **Enrollment Branch** (same or different from walk-in branch)
   - Fill enrollment details (name, phone, course, etc.)
   - If selecting a different branch, a warning appears
   - Optional: Add transfer reason in the yellow remarks field
3. Click **"Convert to Enrollment"** button

**Result:**
- **Same branch**: Enrollment created immediately, walk-in → CONVERTED
- **Different branch**: Transfer request created, walk-in → FOLLOW_UP, status shows as "Transfer Requested"

### For Admin: Approving/Rejecting Transfer Requests

1. Navigate to Transfer Requests: `/admin/transfer-requests`
2. View all pending transfer requests in the table
3. For each pending request:
   - Click **"Approve"** to transfer enrollment to requested branch
   - Click **"Reject"** to keep candidate in original branch
4. Optional: Add admin remarks when prompted
5. Request status updates (color-coded badge changes)

## Data Flow Diagram

### Same Branch (Direct Enrollment)
```
Walk-in (Branch A)
    ↓
Select Branch A for Enrollment
    ↓
Convert to Enrollment
    ↓
✓ Enrollment Created (Branch A)
✓ Payment Created
✓ Walk-in Status: CONVERTED
```

### Different Branch (Transfer Request)
```
Walk-in (Branch A)
    ↓
Select Branch B for Enrollment
    ↓
Add transfer reason (optional)
    ↓
Convert to Enrollment
    ↓
✓ Transfer Request Created (PENDING)
✓ Walk-in Status: FOLLOW_UP
    ↓
Admin Reviews
    ↓
    ├─ APPROVE → Enrollment Created (Branch B)
    │              Walk-in Status: TRANSFERRED
    │              Revenue → Branch B
    │
    └─ REJECT  → Keep in Branch A
                 Walk-in remains available
```

## Key Features

### 1. Branch Governance
- Automatic transfer request creation for cross-branch conversions
- Admin approval required (prevents unauthorized transfers)
- Branch-based revenue attribution

### 2. Audit Trail
- Tracks who requested transfer and when
- Records admin decision and timestamp
- Preserves transfer reason and admin remarks

### 3. Access Control
```
┌─────────────┬──────────────────────────────┐
│ Action      │ Staff | Admin                │
├─────────────┼──────────────────────────────┤
│ Create      │   ✓   | ✓ (automatic)        │
│ View Own    │   ✓   | ✓                    │
│ View All    │   ✗   | ✓                    │
│ Approve     │   ✗   | ✓                    │
│ Reject      │   ✗   | ✓                    │
│ Admin Page  │   ✗   | ✓                    │
└─────────────┴──────────────────────────────┘
```

### 4. Status Badges
- 🟨 **Pending** (amber) - Awaiting admin review
- 🟩 **Approved** (emerald) - Enrolled in requested branch
- 🟥 **Rejected** (rose) - Declined, candidate in original branch

## Database Operations

### Apply Migrations
```bash
python manage.py migrate
```

### Check Database
The migration 0016_branchtransferrequest_walkin_transferred.py creates:
- branch_transfer_requests table with all fields
- Updates walkins table with 'transferred' status option
- Creates proper foreign key relationships

## Testing the Feature

### Test Case 1: Same Branch Enrollment
1. Go to any walk-in
2. Select same branch for enrollment
3. Fill enrollment form
4. Submit
5. ✓ Enrollment created immediately

### Test Case 2: Cross-Branch Transfer - Approve
1. Go to any walk-in
2. Select different branch
3. Add optional reason
4. Submit (creates transfer request)
5. Go to admin → transfer-requests
6. Click Approve
7. ✓ Enrollment created in requested branch
8. ✓ Walk-in status changed to TRANSFERRED

### Test Case 3: Cross-Branch Transfer - Reject
1. Go to any walk-in
2. Select different branch
3. Submit
4. Go to admin → transfer-requests
5. Click Reject
6. ✓ Transfer request rejected
7. ✓ Walk-in remains in original branch

### Test Case 4: Permission Checks
1. Log in as Staff
2. Go to /admin/transfer-requests
3. ✓ Redirected to dashboard (access denied)
4. Walk-in detail shows transfer status
5. Log in as Admin
6. Go to /admin/transfer-requests
7. ✓ Can view and manage requests

## API Response Examples

### Convert Walk-in (Different Branch)
```json
{
  "transfer_requested": true,
  "transfer_request": {
    "id": 45,
    "walkin": 99,
    "candidate_name": "John Doe",
    "phone": "9876543210",
    "current_branch_name": "Gandhipuram",
    "requested_branch_name": "Hopes",
    "course_name": "Python Advanced",
    "requested_by_name": "Alice Johnson",
    "reason": "Candidate prefers location near home",
    "status": "pending",
    "created_at": "2024-04-29T10:30:00Z"
  }
}
```

### List Transfer Requests
```json
{
  "count": 5,
  "results": [
    {
      "id": 45,
      "candidate_name": "John Doe",
      "status": "pending",
      "current_branch_name": "Gandhipuram",
      "requested_branch_name": "Hopes",
      ...
    }
  ]
}
```

## Troubleshooting

### Issue: Transfer request not created
- Check: Is branch different from walk-in branch?
- Check: Are all required fields filled?
- Check: Is the walk-in not already enrolled?

### Issue: Admin cannot see transfer requests
- Check: Is the user marked as SUPER_ADMIN?
- Check: Have you logged out and back in?

### Issue: Enrollment not created on approval
- Check: Are all required fields in enrollment_payload present?
- Check: Do the branch and course exist?
- Check: Is there already an enrollment for this walk-in?

### Issue: Walk-in not showing transferred status
- Check: Has the admin approved the transfer?
- Check: Refresh the page to see latest status

## Configuration Notes

### Role Configuration
- Only users with role = "super_admin" can approve/reject
- Staff users get role = "staff"
- Controlled in User model: `class Role(TextChoices)`

### Branch Assignment
- Walk-ins must have a branch assigned
- Enrollment branch must be a valid branch
- Different branch triggers transfer logic

### Status Field Requirements
- Walk-in statuses: NEW, FOLLOW_UP, CONVERTED, NOT_INTERESTED, TRANSFERRED
- Transfer request statuses: PENDING, APPROVED, REJECTED

## Future Considerations

1. **Notifications**: Email admins when pending transfers > threshold
2. **SLA**: Track time to approval/rejection
3. **Bulk Actions**: Approve multiple transfers at once
4. **Analytics**: Report on cross-branch transfers
5. **Auto-assignment**: Assign to branch staff after approval
6. **Webhooks**: Trigger actions on approval (WhatsApp, etc.)

## Support

For issues or questions:
1. Check TRANSFER_REQUEST_WORKFLOW.md for detailed documentation
2. Review database schema in models.py
3. Check API responses in views.py
4. Test with provided test cases above
