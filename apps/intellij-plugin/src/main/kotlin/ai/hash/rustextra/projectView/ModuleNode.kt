package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.ProjectViewDirectoryHelper
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiFile

class ModuleNode(
    project: Project,
    private val file: ModuleFile,
    viewSettings: ViewSettings?,
) :
    PsiFileNode(project, file, viewSettings) {

    override fun getChildrenImpl(): Collection<AbstractTreeNode<*>> {
        println("getting all children!")

        return ProjectViewDirectoryHelper.getInstance(myProject).getDirectoryChildren(file, settings, true, null)
    };

    override fun contains(file: VirtualFile): Boolean = children.any { child ->
        val value = child.value

        if (value is PsiFile) {
            value.virtualFile.equals(file)
        } else {
            false
        }
    }

    override fun expandOnDoubleClick(): Boolean = true

    companion object {
        fun fromPsiFileNode(node: AbstractTreeNode<PsiFile>, directory: PsiDirectory, settings: ViewSettings?) =
            ModuleNode(node.project, ModuleFile(node.value, directory), settings)
    }
}
