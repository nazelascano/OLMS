// Student Import Dialog Component
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  LinearProgress,
  Chip,
  IconButton,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { CloudUpload, GetApp, Check, Error, Close } from "@mui/icons-material";
import toast from "react-hot-toast";
import { studentsAPI, settingsAPI } from "../../utils/api";
import { ensureUserAttributes } from "../../utils/userAttributes";
import { downloadPDF } from "../../utils/pdfGenerator";

const SECTION_OPTIONS = ["A", "B", "C", "D", "E"];

const sanitizeLibraryCardNumber = (value = "") =>
  value.toString().trim().toUpperCase();

const normalizeLibraryCardNumber = (value = "") =>
  sanitizeLibraryCardNumber(value).replace(/[^A-Z0-9]/g, "");

const isValidLibraryCardNumber = (value = "") => {
  if (!value) {
    return true;
  }
  return /^[A-Z0-9-]{4,30}$/.test(sanitizeLibraryCardNumber(value));
};

const StudentImportDialog = ({ open, onClose, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Results
  const [existingStudents, setExistingStudents] = useState([]);
  const [importSuccessful, setImportSuccessful] = useState(false);
  const [userAttributes, setUserAttributes] = useState(() => ensureUserAttributes());
  const [attributeError, setAttributeError] = useState("");
  const [autoPrintCards, setAutoPrintCards] = useState(true);

  const gradeOptions = userAttributes.gradeLevels || [];

  useEffect(() => {
    if (!open) {
      return;
    }

    let isMounted = true;

    const loadAttributes = async () => {
      try {
        const response = await settingsAPI.getUserAttributes();
        if (isMounted) {
          setUserAttributes(ensureUserAttributes(response.data));
          setAttributeError("");
        }
      } catch (error) {
        console.error("Failed to load user attribute options:", error);
        if (isMounted) {
          setUserAttributes(ensureUserAttributes());
          setAttributeError("Failed to load curriculum and grade options. Using defaults.");
        }
      }
    };

    loadAttributes();

    return () => {
      isMounted = false;
    };
  }, [open]);

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) {
      return;
    }

    const isCSV =
      uploadedFile.type === "text/csv" || uploadedFile.name.toLowerCase().endsWith(".csv");

    if (!isCSV) {
      toast.error("Please upload a valid CSV file");
      return;
    }

    setFile(uploadedFile);

    try {
      const existingStudentsResponse = await studentsAPI.getAll();
      setExistingStudents(existingStudentsResponse.data.students || []);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const rows = text.split(/\r?\n/).filter((row) => row.trim());

          if (rows.length <= 1) {
            toast.error("CSV file does not contain student rows");
            return;
          }

          const headers = rows[0]
            .split(",")
            .map((header) => header.trim().replace(/^"|"$/g, ""));

          const data = rows.slice(1).map((row, index) => {
            const values = row
              .split(",")
              .map((value) => value.trim().replace(/^"|"$/g, ""));
            const student = {};
            headers.forEach((header, i) => {
              const key = header.toLowerCase().replace(/\s+/g, "");
              student[key] = values[i] || "";
            });
            student.rowIndex = index + 2; // account for header row
            return student;
          });

          setCsvData(data);
          setStep(2);
        } catch (parseError) {
          console.error("Failed to parse CSV:", parseError);
          toast.error("Failed to parse CSV file");
        }
      };
      reader.onerror = () => toast.error("Failed to read CSV file");
      reader.readAsText(uploadedFile);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load student data");
    }
  };

  const downloadTemplate = () => {
    const sampleGradePrimary = gradeOptions[0] || "Grade 9";
    const sampleGradeSecondary = gradeOptions[1] || gradeOptions[0] || "Grade 10";
    const sampleSectionPrimary = SECTION_OPTIONS[0];
    const sampleSectionSecondary = SECTION_OPTIONS[1] || SECTION_OPTIONS[0];

    const template = `firstName,lastName,middleName,email,phoneNumber,libraryCardNumber,lrn,grade,section,barangay,municipality,province,fullAddress,parentGuardianName,parentPhone
John,Doe,Santos,john.doe@student.example.edu,09123456789,LIB-25-0101,123456789012,${sampleGradePrimary},${sampleSectionPrimary},Barangay 1,Quezon City,Metro Manila,"123 Main St Barangay 1 Quezon City",Jane Doe,09987654321
Mary,Smith,Cruz,mary.smith@student.example.edu,09111222333,,123456789013,${sampleGradeSecondary},${sampleSectionSecondary},Barangay 2,Manila,Metro Manila,"789 Pine St Barangay 2 Manila",Bob Smith,09444555666`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = "student_import_template.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const validateStudentData = (student, existingList = []) => {
    const errors = [];

    const firstName = (student.firstname || student.firstName || "").trim();
    const lastName = (student.lastname || student.lastName || "").trim();
    const normalizedLRN = (student.lrn || "").trim();
    const rawLibraryCard = (student.librarycardnumber || student.libraryCardNumber || "").trim();
    const cleanedLibraryCard = sanitizeLibraryCardNumber(rawLibraryCard);
    const normalizedLibraryCard = normalizeLibraryCardNumber(cleanedLibraryCard);
    const normalizedGrade = (student.grade || "").trim();
    const normalizedSection = (student.section || "").trim();

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!normalizedLRN) errors.push("LRN required");
    if (!normalizedGrade) errors.push("Grade required");
    if (!normalizedSection) errors.push("Section required");

    if (student.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(student.email.trim())) {
        errors.push("Invalid email format");
      }
    }

    if (normalizedLRN && !/^\d{12}$/.test(normalizedLRN)) {
      errors.push("Invalid LRN (must be 12 digits)");
    }

    if (
      normalizedLRN &&
      existingList.some((s) => ((s.lrn || s.username || "").trim()) === normalizedLRN)
    ) {
      errors.push("LRN already exists in system");
    }

    if (rawLibraryCard && !isValidLibraryCardNumber(rawLibraryCard)) {
      errors.push("Invalid library card number");
    }

    if (
      normalizedLibraryCard &&
      existingList.some(
        (s) =>
          normalizeLibraryCardNumber(s.libraryCardNumber || s.library?.cardNumber || "") ===
          normalizedLibraryCard,
      )
    ) {
      errors.push("Library card number already exists in system");
    }

    if (
      normalizedGrade &&
      gradeOptions.length > 0 &&
      !gradeOptions.some((grade) => grade.toLowerCase() === normalizedGrade.toLowerCase())
    ) {
      errors.push("Invalid grade (must match the configured list)");
    }

    if (
      normalizedSection &&
      !SECTION_OPTIONS.some((section) => section.toLowerCase() === normalizedSection.toLowerCase())
    ) {
      errors.push("Invalid section (must be A-E)");
    }

    return errors;
  };

  const handleImport = async () => {
    setImporting(true);

    const csvLRNs = new Set();
    const csvLibraryCards = new Set();
    const validStudents = [];
    const invalidStudents = [];

    try {
      csvData.forEach((student) => {
        const errors = validateStudentData(student, existingStudents);
        const normalizedLRN = (student.lrn || "").trim();
        const cleanedLibraryCard = sanitizeLibraryCardNumber(
          student.librarycardnumber || student.libraryCardNumber || "",
        );
        const normalizedCard = normalizeLibraryCardNumber(cleanedLibraryCard);

        if (normalizedLRN && csvLRNs.has(normalizedLRN)) {
          errors.push("Duplicate LRN in CSV file");
        }
        if (normalizedCard && csvLibraryCards.has(normalizedCard)) {
          errors.push("Duplicate library card number in CSV file");
        }

        if (errors.length === 0) {
          if (normalizedLRN) csvLRNs.add(normalizedLRN);
          if (normalizedCard) csvLibraryCards.add(normalizedCard);

          validStudents.push({
            firstName: student.firstname || student.firstName,
            lastName: student.lastname || student.lastName,
            middleName: student.middlename || student.middleName || "",
            email: student.email,
            phoneNumber: student.phonenumber || student.phoneNumber || "",
            lrn: normalizedLRN,
            grade: student.grade,
            section: student.section,
            libraryCardNumber: cleanedLibraryCard || undefined,
            barangay: student.barangay || "",
            municipality: student.municipality || "",
            province: student.province || "",
            fullAddress: student.fulladdress || student.fullAddress || "",
            parentGuardianName:
              student.parentguardianname ||
              student.parentGuardianName ||
              student.parentname ||
              student.parentName ||
              "",
            parentPhone: student.parentphone || student.parentPhone || "",
            username: normalizedLRN,
            rowIndex: student.rowIndex,
          });
        } else {
          invalidStudents.push({
            ...student,
            errors,
          });
        }
      });

      if (validStudents.length === 0) {
        toast.error("No valid students found in the import file");
        setImporting(false);
        return;
      }

      const response = await studentsAPI.bulkImport(validStudents);

      setImportResults({
        success: response.data.results.success,
        errors: response.data.results.errors,
        details: response.data.results.details,
        invalidStudents,
      });

      setStep(3);

      if (response.data.results?.success > 0) {
        toast.success(`Successfully imported ${response.data.results.success} students`);
        setImportSuccessful(true);
      }

      if (response.data.results?.errors > 0) {
        toast.error(`${response.data.results.errors} students failed to import`);
      }
    } catch (error) {
      console.error("Import error:", error);
      const responseMessage = error?.response?.data?.message;
      const responseErrors = error?.response?.data?.errors;
      const missingRows = error?.response?.data?.missing;
      const responseDetails = error?.response?.data?.results?.details;

      if (Array.isArray(responseDetails) && responseDetails.length > 0) {
        setImportResults({
          success: responseDetails.filter((detail) => detail.status === "success").length,
          errors: responseDetails.filter((detail) => detail.status !== "success").length,
          details: responseDetails,
          invalidStudents,
        });
        setStep(3);
        toast.error(
          responseMessage || "Bulk import failed. Review the details for row-specific errors.",
          { duration: 6000 },
        );
        return;
      }

      if (Array.isArray(responseErrors) && responseErrors.length > 0) {
        console.warn("Import validation errors:", responseErrors);
        const summarized = responseErrors
          .slice(0, 5)
          .map((entry) => {
            const rowNumber = entry.rowIndex
              ? entry.rowIndex
              : typeof entry.idx === "number"
              ? entry.idx + 2
              : "?";
            const issues = Array.isArray(entry.issues)
              ? entry.issues
              : Array.isArray(entry.errors)
              ? entry.errors
              : [entry.error || "Unknown validation issue"];
            return `Row ${rowNumber}: ${issues.join(", ")}`;
          })
          .join("\n");

        toast.error(
          responseMessage ? `${responseMessage}\n${summarized}` : `Bulk import failed:\n${summarized}`,
          { duration: 8000 },
        );
        return;
      }

      if (Array.isArray(missingRows) && missingRows.length > 0) {
        const summarized = missingRows
          .slice(0, 5)
          .map((entry) => {
            const rowNumber = entry.rowIndex
              ? entry.rowIndex
              : typeof entry.idx === "number"
              ? entry.idx + 2
              : "?";
            const cardRef = entry.libraryCardNumber ? ` (Library Card ${entry.libraryCardNumber})` : "";
            return `Row ${rowNumber}${cardRef}: Missing LRN`;
          })
          .join("\n");

        toast.error(
          responseMessage ? `${responseMessage}\n${summarized}` : `Bulk import failed:\n${summarized}`,
          { duration: 8000 },
        );
        return;
      }

      toast.error(responseMessage || "Failed to import students");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = async () => {
    const wasSuccessful = importSuccessful;
    const shouldAutoPrint = autoPrintCards;
    const successfulStudents = importResults?.details?.filter((detail) => detail.status === "success") || [];

    setFile(null);
    setCsvData([]);
    setImportResults(null);
    setStep(1);
    setExistingStudents([]);
    setImportSuccessful(false);
    setAttributeError("");
    setAutoPrintCards(true);

    if (wasSuccessful && successfulStudents.length > 0 && shouldAutoPrint) {
      const loadingId = toast.loading("Generating library cards for imported students...");
      try {
        const allStudentsResponse = await studentsAPI.getAll();
        const allStudents = allStudentsResponse.data.students || [];

        const importedStudents = allStudents.filter((student) => {
          const studentCard = normalizeLibraryCardNumber(
            student.libraryCardNumber || student.library?.cardNumber || "",
          );
          const studentLRN = (student.lrn || "").trim();

          const matched = successfulStudents.some((success) => {
            const successCard = normalizeLibraryCardNumber(
              success.libraryCardNumber || success.librarycardnumber || "",
            );
            const successLRN = (success.lrn || "").trim();
            return (
              (successCard && studentCard && successCard === studentCard) ||
              (successLRN && studentLRN && successLRN === studentLRN)
            );
          });

          return matched && !!student.libraryCardNumber;
        });

        if (importedStudents.length > 0) {
          try {
            const pdfModule = await import(
              /* webpackChunkName: "pdf-generator" */ "../../utils/pdfGenerator"
            );
            const multiPDF = await pdfModule.generateLibraryCardsPDF(importedStudents);
            const filename = `library_cards_import_${Date.now()}.pdf`;
            downloadPDF(multiPDF, filename);
            toast.dismiss(loadingId);
            toast.success(`Generated ${importedStudents.length} library cards successfully!`);
          } catch (pdfError) {
            console.error("Failed to generate combined library cards PDF:", pdfError);
            toast.dismiss(loadingId);
            toast.error("Failed to generate library cards");
          }
        } else {
          toast.dismiss(loadingId);
          toast.error("No imported students with assigned library card numbers found");
        }
      } catch (error) {
        console.error("Error generating library cards after import:", error);
        toast.dismiss(loadingId);
        toast.error("Failed to generate library cards");
      }
    }

    onClose();

    if (wasSuccessful && onImportComplete) {
      onImportComplete();
    }
  };

  const renderUploadStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Upload a CSV file with student data. Download the template below to see the required format.
        </Typography>
      </Alert>
      {gradeOptions.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Available grade levels: {gradeOptions.join(", ")}
        </Typography>
      )}
      <Box display="flex" gap={2} mb={3}>
        <Button variant="outlined" startIcon={<GetApp />} onClick={downloadTemplate}>
          Download Template
        </Button>
      </Box>
      <label htmlFor="csv-file-input" style={{ display: "block", cursor: "pointer" }}>
        <Paper
          role="button"
          tabIndex={0}
          sx={{
            border: "2px dashed #ccc",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
            cursor: "pointer",
            "&:hover": { borderColor: "#22C55E" },
          }}
        >
          <CloudUpload aria-hidden="true" sx={{ fontSize: 48, color: "#666", mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Click or press Enter to upload CSV file
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Supported format: CSV files only
          </Typography>
        </Paper>
      </label>
      <input
        id="csv-file-input"
        type="file"
        accept=".csv"
        aria-label="Upload students CSV"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      {file && (
        <Box mt={2}>
          <Typography variant="body2">
            Selected file: <strong>{file.name}</strong>
          </Typography>
        </Box>
      )}
    </Box>
  );

  const renderPreviewStep = () => {
    const csvLRNs = new Set();
    const csvLibraryCards = new Set();
    const duplicateLRNs = new Set();
    const duplicateCards = new Set();

    csvData.forEach((student) => {
      const normalizedLRN = (student.lrn || "").trim();
      const normalizedCard = normalizeLibraryCardNumber(
        student.librarycardnumber || student.libraryCardNumber || "",
      );

      if (normalizedLRN) {
        if (csvLRNs.has(normalizedLRN)) {
          duplicateLRNs.add(normalizedLRN);
        } else {
          csvLRNs.add(normalizedLRN);
        }
      }

      if (normalizedCard) {
        if (csvLibraryCards.has(normalizedCard)) {
          duplicateCards.add(normalizedCard);
        } else {
          csvLibraryCards.add(normalizedCard);
        }
      }
    });

    return (
      <Box>
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Found {csvData.length} students in the CSV file. Review the data below and click Import to proceed.
          </Typography>
        </Alert>

        <Box sx={{ mb: 3, p: 2, bgcolor: "background.paper", borderRadius: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={autoPrintCards}
                onChange={(e) => setAutoPrintCards(e.target.checked)}
                color="primary"
              />
            }
            label="Automatically generate and download library cards for imported students"
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, display: "block" }}>
            PDFs will download automatically after a successful import
          </Typography>
        </Box>

        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Library Card</TableCell>
                <TableCell>LRN</TableCell>
                <TableCell>Grade</TableCell>
                <TableCell>Section</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Issues</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {csvData.map((student, index) => {
                const errors = validateStudentData(student, existingStudents);
                const normalizedLRN = (student.lrn || "").trim();
                const normalizedCard = normalizeLibraryCardNumber(
                  student.librarycardnumber || student.libraryCardNumber || "",
                );

                if (normalizedLRN && duplicateLRNs.has(normalizedLRN)) {
                  errors.push("Duplicate LRN in CSV file");
                }
                if (normalizedCard && duplicateCards.has(normalizedCard)) {
                  errors.push("Duplicate library card number in CSV file");
                }

                const isValid = errors.length === 0;

                return (
                  <TableRow key={index}>
                    <TableCell>
                      {(student.firstname || student.firstName || "").trim()} {(
                        student.lastname || student.lastName || ""
                      ).trim()}
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      {student.librarycardnumber || student.libraryCardNumber || "(auto)"}
                    </TableCell>
                    <TableCell>{student.lrn}</TableCell>
                    <TableCell>{student.grade}</TableCell>
                    <TableCell>{student.section}</TableCell>
                    <TableCell>
                      <Chip
                        label={isValid ? "Valid" : "Invalid"}
                        color={isValid ? "success" : "error"}
                        size="small"
                        icon={isValid ? <Check /> : <Error />}
                      />
                    </TableCell>
                    <TableCell>
                      {errors.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No issues detected
                        </Typography>
                      ) : (
                        <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                          {errors.map((err, errIdx) => (
                            <Typography component="li" variant="body2" key={`err-${errIdx}`}>
                              {err}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const renderResultsStep = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Import completed! {importResults.success} students imported successfully, {importResults.errors} failed.
        </Typography>
      </Alert>
      {(importResults.details?.length > 0 || (importResults.invalidStudents?.length || 0) > 0) && (
        <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Row</TableCell>
                <TableCell>Library Card</TableCell>
                <TableCell>LRN</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(importResults.details || []).map((detail, index) => (
                <TableRow key={`result-${index}`}>
                  <TableCell>{detail.rowIndex ? `Row ${detail.rowIndex}` : "-"}</TableCell>
                  <TableCell>{detail.libraryCardNumber || "-"}</TableCell>
                  <TableCell>{detail.lrn || "-"}</TableCell>
                  <TableCell>
                    <Chip
                      label={detail.status === "success" ? "Success" : "Error"}
                      color={detail.status === "success" ? "success" : "error"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const issues = Array.isArray(detail.issues) && detail.issues.length > 0
                        ? detail.issues.join(", ")
                        : null;
                      return detail.message || issues || (detail.status === "success" ? "Imported successfully" : "No details provided");
                    })()}
                  </TableCell>
                </TableRow>
              ))}
              {(importResults.invalidStudents || []).map((student, index) => (
                <TableRow key={`invalid-${student.librarycardnumber || student.libraryCardNumber || index}`}>
                  <TableCell>{student.rowIndex ? `Row ${student.rowIndex}` : "-"}</TableCell>
                  <TableCell>{student.librarycardnumber || student.libraryCardNumber || "(auto)"}</TableCell>
                  <TableCell>{student.lrn || "-"}</TableCell>
                  <TableCell>
                    <Chip label="Invalid" color="error" size="small" />
                  </TableCell>
                  <TableCell>{Array.isArray(student.errors) ? student.errors.join(", ") : "Invalid data"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Import Students</Typography>
          <IconButton onClick={handleClose}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {importing && <LinearProgress sx={{ mb: 2 }} />}
        {attributeError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {attributeError}
          </Alert>
        )}
        {step === 1 && renderUploadStep()}
        {step === 2 && renderPreviewStep()}
        {step === 3 && importResults && renderResultsStep()}
      </DialogContent>
      <DialogActions>
        {step === 2 && (
          <>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="contained" onClick={handleImport} disabled={importing || csvData.length === 0}>
              {importing ? "Importing..." : `Import ${csvData.length} Students`}
            </Button>
          </>
        )}
        {step === 3 && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default StudentImportDialog;
