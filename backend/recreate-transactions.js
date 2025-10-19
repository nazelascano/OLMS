const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'transactions.json');
const backupPath = path.join(__dirname, 'data', 'transactions.json.corrupted');

try {
    // Move corrupted file
    if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, backupPath);
        console.log('✅ Backed up corrupted file to transactions.json.corrupted');
    }

    // Create fresh transactions array with the 10 sample transactions
    const transactions = [{
            "id": "trans_1760075048750_rjn1s97q3",
            "userId": "mgfdmmif38s76",
            "items": [{
                "copyId": "978-0132350884-MGKEV9OH-8QTV",
                "bookId": "book_1760074424513_m9yw6i6kn",
                "isbn": "978-0132350884",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-07T13:50:40.919Z",
            "dueDate": "2025-10-21T13:50:40.919Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-07T13:50:40.919Z",
            "updatedAt": "2025-10-07T13:50:40.919Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nch5g0jh"
        },
        {
            "id": "trans_1760075049000_ezuxu940e",
            "userId": "mgfg021jvftif",
            "items": [{
                "copyId": "978-0262033848-MGKEV9K8-I074",
                "bookId": "book_1760074424360_iiue297m0",
                "isbn": "978-0262033848",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-05T13:50:40.930Z",
            "dueDate": "2025-10-19T13:50:40.930Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-05T13:50:40.930Z",
            "updatedAt": "2025-10-05T13:50:40.930Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8njdoz9fo"
        },
        {
            "id": "trans_1760075049180_u7flqmwbz",
            "userId": "mgfg0hpq7olld",
            "items": [{
                "copyId": "978-0134685991-MGKEV9KE-02TW",
                "bookId": "book_1760074424665_uw74ovqe9",
                "isbn": "978-0134685991",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-09-20T13:50:40.957Z",
            "dueDate": "2025-10-04T13:50:40.957Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-09-20T13:50:40.957Z",
            "updatedAt": "2025-09-20T13:50:40.957Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8np8vmvtq"
        },
        {
            "id": "trans_1760075049352_9hxgqtqje",
            "userId": "mgfg1bbx76iq2",
            "items": [{
                "copyId": "978-0134757599-MGKEV9KP-KIQY",
                "bookId": "book_1760074425018_l9hh9ovex",
                "isbn": "978-0134757599",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-02T13:50:40.977Z",
            "dueDate": "2025-10-16T13:50:40.977Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-02T13:50:40.977Z",
            "updatedAt": "2025-10-02T13:50:40.977Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nqjgcg3j"
        },
        {
            "id": "trans_1760075049532_a51y9hfcm",
            "userId": "mgfg2ggdtljgo",
            "items": [{
                "copyId": "978-0596007126-MGKEV9LX-K5SO",
                "bookId": "book_1760074425576_adfx9owoo",
                "isbn": "978-0596007126",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-01T13:50:40.997Z",
            "dueDate": "2025-10-15T13:50:40.997Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-01T13:50:40.997Z",
            "updatedAt": "2025-10-01T13:50:40.997Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nrzaqgpz"
        },
        {
            "id": "trans_1760075049713_qghxnjqbh",
            "userId": "mgfg2y0kzx0fg",
            "items": [{
                "copyId": "978-0596517748-MGKEV9M9-D6TL",
                "bookId": "book_1760074425941_wkqbp97co",
                "isbn": "978-0596517748",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-09-22T13:50:41.019Z",
            "dueDate": "2025-10-06T13:50:41.019Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-09-22T13:50:41.019Z",
            "updatedAt": "2025-09-22T13:50:41.019Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nta80bsm"
        },
        {
            "id": "trans_1760075049885_5qe63l0xh",
            "userId": "mgfg3kqzb3yq2",
            "items": [{
                "copyId": "978-1449355739-MGKEV9MO-F6CE",
                "bookId": "book_1760074426277_cxfyp96q2",
                "isbn": "978-1449355739",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-09-15T13:50:41.041Z",
            "dueDate": "2025-09-29T13:50:41.041Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-09-15T13:50:41.041Z",
            "updatedAt": "2025-09-15T13:50:41.041Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8numcmzim"
        },
        {
            "id": "trans_1760075050058_yyqsf4uyy",
            "userId": "mgfg417qlbj08",
            "items": [{
                "copyId": "978-1491904244-MGKEV9N2-6TQV",
                "bookId": "book_1760074426666_n9c2i96fy",
                "isbn": "978-1491904244",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-09-28T13:50:41.061Z",
            "dueDate": "2025-10-12T13:50:41.061Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-09-28T13:50:41.061Z",
            "updatedAt": "2025-09-28T13:50:41.061Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nw6rkrx4"
        },
        {
            "id": "trans_1760075050235_a8akjhjtg",
            "userId": "mgfg4nypjvqhr",
            "items": [{
                "copyId": "978-1491950296-MGKEV9NE-4YJ8",
                "bookId": "book_1760074427010_wqscq96rz",
                "isbn": "978-1491950296",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-03T13:50:41.081Z",
            "dueDate": "2025-10-17T13:50:41.081Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-03T13:50:41.081Z",
            "updatedAt": "2025-10-03T13:50:41.081Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nxlcb5je"
        },
        {
            "id": "trans_1760075050419_bfhvlzrwj",
            "userId": "mgfg54ppgfuec",
            "items": [{
                "copyId": "978-1593275846-MGKEV9NU-T25X",
                "bookId": "book_1760074427324_dvj0a96r7",
                "isbn": "978-1593275846",
                "status": "borrowed"
            }],
            "type": "regular",
            "status": "borrowed",
            "borrowDate": "2025-10-08T13:50:41.103Z",
            "dueDate": "2025-10-22T13:50:41.103Z",
            "returnDate": null,
            "fineAmount": 0,
            "notes": "Sample transaction created for testing",
            "renewalCount": 0,
            "createdAt": "2025-10-08T13:50:41.103Z",
            "updatedAt": "2025-10-08T13:50:41.103Z",
            "createdBy": "mgex1wgwp3019",
            "_id": "mgkf8nz2g2jhs"
        }
    ];

    // Write clean JSON
    fs.writeFileSync(filePath, JSON.stringify(transactions, null, 2), 'utf8');

    console.log('✅ Created fresh transactions.json with', transactions.length, 'transactions');
    console.log('📊 Transaction summary:');
    console.log('  - All status: borrowed');
    console.log('  - 3 overdue (due dates before Oct 10)');
    console.log('  - 7 not overdue yet');

} catch (error) {
    console.error('❌ Error:', error.message);
}